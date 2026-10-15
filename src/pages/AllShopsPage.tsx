import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowUpDown,
  Crosshair,
  Filter,
  Grid3x3,
  List,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Store,
  X,
} from 'lucide-react'
import { clsx } from 'clsx'
import { DataState, EmptyState, PageHeader, Spinner } from '@/components/common'
import { ShopCard } from '@/components/shops/ShopCard'
import { useConfirm, useToast } from '@/app/providers'
import { useSessionState, useShops } from '@/hooks'
import { bumpRevision } from '@/hooks'
import { allCategories, allTags, deleteShop, searchShops } from '@/services/shopService'
import { getCurrentPosition, LocationError } from '@/services/locationService'
import type { GeoPosition, Shop } from '@/types'
import { haversineMeters, pluralize } from '@/utils/format'

type SortKey = 'recent' | 'name' | 'visited' | 'added' | 'nearest'
type VisitedFilter = 'all' | 'visited' | 'never'
type ViewMode = 'grid' | 'list'

interface Filters {
  query: string
  category: string
  tag: string
  visited: VisitedFilter
  addedFrom: string
  addedTo: string
  visitedFrom: string
  visitedTo: string
  sort: SortKey
  view: ViewMode
}

const DEFAULT_FILTERS: Filters = {
  query: '',
  category: '',
  tag: '',
  visited: 'all',
  addedFrom: '',
  addedTo: '',
  visitedFrom: '',
  visitedTo: '',
  sort: 'recent',
  view: 'grid',
}

/** All Shops: searchable, filterable, sortable list of every saved shop. */
export default function AllShopsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { success, info, error: toastError } = useToast()
  const confirm = useConfirm()

  // Filters survive navigation within the session.
  const [filters, setFilters] = useSessionState<Filters>('all-shops-filters', DEFAULT_FILTERS)

  const [showFilters, setShowFilters] = useState(false)
  const [userPosition, setUserPosition] = useState<GeoPosition | null>(null)
  const [locating, setLocating] = useState(false)

  const { shops, loading, error, locked, reload } = useShops()

  // Deep links from the dashboard / header search set the query on arrival.
  useEffect(() => {
    const q = searchParams.get('q')
    const visited = searchParams.get('visited') as VisitedFilter | null
    const sort = searchParams.get('sort') as SortKey | null

    if (q !== null || visited || sort) {
      setFilters({
        ...filters,
        ...(q !== null ? { query: q } : {}),
        ...(visited ? { visited } : {}),
        ...(sort ? { sort } : {}),
      })
      setSearchParams({}, { replace: true })
    }
    // Only react to the incoming query string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  function patch(next: Partial<Filters>) {
    setFilters({ ...filters, ...next })
  }

  function resetFilters() {
    setFilters({ ...DEFAULT_FILTERS, view: filters.view })
    info('Filters reset')
  }

  const handleLocateForSort = useCallback(async () => {
    setLocating(true)
    try {
      const position = await getCurrentPosition({ highAccuracy: true })
      setUserPosition(position)
      patch({ sort: 'nearest' })
      success('Location found', 'Shops are now sorted by distance from you.')
    } catch (err) {
      toastError('Could not read your location', (err as LocationError).message)
    } finally {
      setLocating(false)
    }
  }, [success, toastError]) // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(() => allCategories(shops), [shops])
  const tags = useMemo(() => allTags(shops), [shops])

  const filtered = useMemo(() => {
    let list = searchShops(shops, filters.query)

    if (filters.category) list = list.filter((shop) => shop.category === filters.category)

    if (filters.tag) {
      const tag = filters.tag.toLowerCase()
      list = list.filter((shop) => (shop.tags ?? []).some((t) => t.toLowerCase() === tag))
    }

    if (filters.visited === 'visited') {
      list = list.filter((shop) => (shop.visitCount ?? 0) > 0 || shop.lastVisitedAt)
    } else if (filters.visited === 'never') {
      list = list.filter((shop) => (shop.visitCount ?? 0) === 0 && !shop.lastVisitedAt)
    }

    if (filters.addedFrom) {
      const from = new Date(`${filters.addedFrom}T00:00:00`).getTime()
      list = list.filter((shop) => new Date(shop.createdAt).getTime() >= from)
    }
    if (filters.addedTo) {
      const to = new Date(`${filters.addedTo}T23:59:59`).getTime()
      list = list.filter((shop) => new Date(shop.createdAt).getTime() <= to)
    }

    if (filters.visitedFrom) {
      const from = new Date(`${filters.visitedFrom}T00:00:00`).getTime()
      list = list.filter((shop) => shop.lastVisitedAt && new Date(shop.lastVisitedAt).getTime() >= from)
    }
    if (filters.visitedTo) {
      const to = new Date(`${filters.visitedTo}T23:59:59`).getTime()
      list = list.filter((shop) => shop.lastVisitedAt && new Date(shop.lastVisitedAt).getTime() <= to)
    }

    const sorted = [...list]

    switch (filters.sort) {
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'added':
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        break
      case 'visited':
        sorted.sort((a, b) => (b.lastVisitedAt ?? '').localeCompare(a.lastVisitedAt ?? ''))
        break
      case 'nearest':
        if (userPosition) {
          sorted.sort(
            (a, b) =>
              haversineMeters(userPosition, { latitude: a.latitude, longitude: a.longitude }) -
              haversineMeters(userPosition, { latitude: b.latitude, longitude: b.longitude }),
          )
        }
        break
      case 'recent':
      default:
        sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        break
    }

    return sorted
  }, [shops, filters, userPosition])

  const activeFilterCount = [
    filters.category,
    filters.tag,
    filters.visited !== 'all' ? filters.visited : '',
    filters.addedFrom,
    filters.addedTo,
    filters.visitedFrom,
    filters.visitedTo,
  ].filter(Boolean).length

  function distanceFor(shop: Shop): number | null {
    if (!userPosition) return null
    return haversineMeters(userPosition, { latitude: shop.latitude, longitude: shop.longitude })
  }

  async function handleDelete(shopId: string) {
    const shop = shops.find((s) => s.id === shopId)
    if (!shop) return

    const answer = await confirm({
      title: `Delete ${shop.name}?`,
      message: `This shop and its contacts will be removed from the local database file. It has ${shop.visitCount ?? 0} visit record(s).`,
      confirmLabel: 'Continue',
      tone: 'danger',
      checkbox: {
        label: 'Also delete this shopâ€™s visit history',
        defaultChecked: true,
      },
    })
    if (!answer.confirmed) return

    await deleteShop(shop.id, answer.checked)
    bumpRevision()
    success('Shop deleted', answer.checked ? 'Its visit records were deleted too.' : 'Visit records were kept.')
  }

  return (
    <>
      <PageHeader
        title="All Shops"
        description={`${pluralize(shops.length, 'shop')} saved in the local database file.`}
        icon={<Store className="h-5 w-5 text-brand-700" />}
        actions={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowFilters((value) => !value)}
            >
              <Filter className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-1 rounded-full bg-brand-700 px-1.5 text-xs text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <Link to="/add" className="btn-primary">
              <Plus className="h-4 w-4" />
              Add Shop
            </Link>
          </>
        }
      />

      {/* --------------------------------- Toolbar --------------------------------- */}
      <div className="card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              type="search"
              className="input pl-9"
              value={filters.query}
              onChange={(event) => patch({ query: event.target.value })}
              placeholder="Search name, owner, phone, address, category, notesâ€¦"
              aria-label="Search shops"
            />
            {filters.query && (
              <button
                type="button"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-ink-400 hover:bg-ink-100"
                onClick={() => patch({ query: '' })}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <label className="sr-only" htmlFor="sort-select">
            Sort shops
          </label>
          <div className="relative">
            <ArrowUpDown className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <select
              id="sort-select"
              className="input min-w-[11rem] pl-9"
              value={filters.sort}
              onChange={(event) => patch({ sort: event.target.value as SortKey })}
            >
              <option value="recent">Recently updated</option>
              <option value="added">Recently added</option>
              <option value="visited">Recently visited</option>
              <option value="name">Name (Aâ€“Z)</option>
              <option value="nearest">Nearest to me</option>
            </select>
          </div>

          {filters.sort === 'nearest' && !userPosition && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleLocateForSort}
              disabled={locating}
            >
              {locating ? <Spinner className="h-4 w-4" /> : <Crosshair className="h-4 w-4" />}
              Allow location
            </button>
          )}

          <div className="flex rounded-lg border border-ink-300 p-0.5" role="group" aria-label="View mode">
            <button
              type="button"
              className={clsx(
                'rounded-md px-2.5 py-1.5',
                filters.view === 'grid' ? 'bg-brand-700 text-white' : 'text-ink-600 hover:bg-ink-100',
              )}
              onClick={() => patch({ view: 'grid' })}
              aria-pressed={filters.view === 'grid'}
              title="Grid view"
            >
              <Grid3x3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={clsx(
                'rounded-md px-2.5 py-1.5',
                filters.view === 'list' ? 'bg-brand-700 text-white' : 'text-ink-600 hover:bg-ink-100',
              )}
              onClick={() => patch({ view: 'list' })}
              aria-pressed={filters.view === 'list'}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ------------------------------- Filter panel ------------------------------- */}
        {showFilters && (
          <div className="mt-3 grid gap-3 border-t border-ink-200 pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label" htmlFor="filter-category">
                Category
              </label>
              <select
                id="filter-category"
                className="input"
                value={filters.category}
                onChange={(event) => patch({ category: event.target.value })}
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="filter-tag">
                Tag
              </label>
              <select
                id="filter-tag"
                className="input"
                value={filters.tag}
                onChange={(event) => patch({ tag: event.target.value })}
              >
                <option value="">All tags</option>
                {tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="filter-visited">
                Visit status
              </label>
              <select
                id="filter-visited"
                className="input"
                value={filters.visited}
                onChange={(event) => patch({ visited: event.target.value as VisitedFilter })}
              >
                <option value="all">All shops</option>
                <option value="visited">Visited at least once</option>
                <option value="never">Never visited</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="filter-added-from">
                  Added from
                </label>
                <input
                  id="filter-added-from"
                  type="date"
                  className="input"
                  value={filters.addedFrom}
                  onChange={(event) => patch({ addedFrom: event.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="filter-added-to">
                  Added to
                </label>
                <input
                  id="filter-added-to"
                  type="date"
                  className="input"
                  value={filters.addedTo}
                  onChange={(event) => patch({ addedTo: event.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="filter-visited-from">
                  Visited from
                </label>
                <input
                  id="filter-visited-from"
                  type="date"
                  className="input"
                  value={filters.visitedFrom}
                  onChange={(event) => patch({ visitedFrom: event.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="filter-visited-to">
                  Visited to
                </label>
                <input
                  id="filter-visited-to"
                  type="date"
                  className="input"
                  value={filters.visitedTo}
                  onChange={(event) => patch({ visitedTo: event.target.value })}
                />
              </div>
            </div>

            <div className="flex items-end sm:col-span-2 lg:col-span-4">
              <button type="button" className="btn-secondary" onClick={resetFilters}>
                <RotateCcw className="h-4 w-4" />
                Reset filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---------------------------------- Results ---------------------------------- */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-sm text-ink-500">
          {pluralize(filtered.length, 'matching shop')}
          {filtered.length !== shops.length && ` of ${shops.length}`}
        </p>
      </div>

      <div className="mt-3">
        <DataState
          loading={loading}
          error={error}
          locked={locked}
          onRetry={reload}
          empty={filtered.length === 0}
          emptyState={
            shops.length === 0 ? (
              <EmptyState
                icon={<MapPin className="h-6 w-6" />}
                title="No shops saved yet"
                description="Save the shops you visit so you can find them again without searching from scratch."
                action={
                  <Link to="/add" className="btn-primary btn-sm">
                    <Plus className="h-3.5 w-3.5" />
                    Add your first shop
                  </Link>
                }
              />
            ) : (
              <EmptyState
                icon={<Search className="h-6 w-6" />}
                title="No shops match your filters"
                description="Try a different search term, or reset the filters to see every saved shop."
                action={
                  <button type="button" className="btn-primary btn-sm" onClick={resetFilters}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset Filters
                  </button>
                }
              />
            )
          }
        >
          <div
            className={clsx(
              'grid gap-3',
              filters.view === 'grid' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1',
            )}
          >
            {filtered.map((shop) => (
              <ShopCard
                key={shop.id}
                shop={shop}
                variant={filters.view}
                distanceMeters={distanceFor(shop)}
                onDirections={(shopId) => navigate(`/directions/${shopId}`)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </DataState>
      </div>
    </>
  )
}

