import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowDownUp,
  CalendarRange,
  Clock,
  Download,
  FileSpreadsheet,
  Filter,
  Layers,
  MessageSquareText,
  Plus,
  RotateCcw,
  Search,
  Store,
  X,
} from 'lucide-react'
import { clsx } from 'clsx'
import { DataState, EmptyState, PageHeader } from '@/components/common'
import { VisitCard } from '@/components/visits/VisitCard'
import { VisitDialog } from '@/components/shops/VisitDialog'
import { useConfirm, useToast } from '@/app/providers'
import { useShops, useVisits, useSessionState } from '@/hooks'
import { bumpRevision } from '@/hooks'
import {
  deleteVisit,
  filterVisits,
  groupVisitsByDate,
  groupVisitsByShop,
  sortVisits,
  updateVisit,
} from '@/services/visitService'
import { buildCsv, downloadTextFile } from '@/utils/csv'
import { formatDayHeading, pluralize, toDateKey } from '@/utils/format'
import type { Visit, VisitWithShop } from '@/types'

type GroupMode = 'date' | 'shop' | 'none'

interface VisitFiltersState {
  query: string
  shopId: string
  from: string
  to: string
  direction: 'newest' | 'oldest'
  group: GroupMode
}

const DEFAULT_FILTERS: VisitFiltersState = {
  query: '',
  shopId: '',
  from: '',
  to: '',
  direction: 'newest',
  group: 'date',
}

/** Shop Messages / Visit History: every visit note, searchable and filterable. */
export default function VisitHistoryPage() {
  const [searchParams] = useSearchParams()
  const { success, info, warning } = useToast()
  const confirm = useConfirm()

  const { data: visits, loading, error, locked, reload } = useVisits()
  const { shops } = useShops()

  const [filters, setFilters] = useSessionState<VisitFiltersState>('visit-filters', {
    ...DEFAULT_FILTERS,
    shopId: searchParams.get('shop') ?? '',
  })

  const [showFilters, setShowFilters] = useState(false)
  const [editing, setEditing] = useState<Visit | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  function patch(next: Partial<VisitFiltersState>) {
    setFilters({ ...filters, ...next })
  }

  const filtered = useMemo(
    () =>
      sortVisits(
        filterVisits(visits, {
          query: filters.query,
          shopId: filters.shopId,
          from: filters.from,
          to: filters.to,
        }),
        filters.direction,
      ),
    [visits, filters.query, filters.shopId, filters.from, filters.to, filters.direction],
  )

  const byDate = useMemo(() => groupVisitsByDate(filtered), [filtered])
  const byShop = useMemo(() => groupVisitsByShop(filtered), [filtered])

  const shopsWithVisits = useMemo(() => {
    const ids = new Set(visits.map((visit) => visit.shopId))
    return shops.filter((shop) => ids.has(shop.id)).sort((a, b) => a.name.localeCompare(b.name))
  }, [visits, shops])

  const activeFilterCount = [
    filters.shopId,
    filters.from,
    filters.to,
    filters.direction === 'oldest' ? 'oldest' : '',
  ].filter(Boolean).length

  async function handleDelete(visit: VisitWithShop) {
    const answer = await confirm({
      title: 'Delete this visit record?',
      message:
        `The note from ${formatDayHeading(toDateKey(visit.visitedAt))} will be permanently removed.\n\n` +
        'The shop itself and its other visit records are not affected.',
      confirmLabel: 'Delete visit record',
      tone: 'danger',
    })
    if (!answer.confirmed) return

    await deleteVisit(visit.id)
    bumpRevision()
    info('Visit record deleted')
  }

  async function handleSaveEdit(values: {
    visitedAt: string
    note: string
    purpose: string
    amountSpent: string
  }) {
    if (!editing) return
    await updateVisit(editing.id, values)
    bumpRevision()
    success('Visit note updated')
    setEditing(null)
    setDialogOpen(false)
  }

  function handleExportCsv() {
    if (!filtered.length) {
      warning('Nothing to export', 'No visit records match the current filters.')
      return
    }

    const rows = filtered.map((visit) => [
      visit.shop?.name ?? 'Deleted shop',
      visit.visitedAt,
      visit.note,
      visit.purpose,
      visit.amountSpent,
      visit.shop?.address ?? '',
      visit.shop ? `${visit.shop.latitude}, ${visit.shop.longitude}` : '',
    ])

    const csv = buildCsv(
      ['Shop', 'Visited at', 'Note', 'Purpose', 'Amount spent', 'Shop address', 'Coordinates'],
      rows,
    )

    const stamp = toDateKey(new Date().toISOString())
    downloadTextFile(`visits-export-${stamp}.csv`, csv)
    warning(
      'CSV export created - it is NOT encrypted',
      'The file is readable plain text and may contain personal information such as shop names, amounts and notes. ' +
        'Store it carefully, or use the encrypted backup instead.',
    )
  }

  function resetFilters() {
    setFilters({ ...DEFAULT_FILTERS, group: filters.group })
    info('Filters reset')
  }

  const editShopForDialog = editing ? (shops.find((s) => s.id === editing.shopId) ?? null) : null

  return (
    <>
      <PageHeader
        title="Shop Messages / Visit History"
        description={`${pluralize(visits.length, 'visit record')} saved on this device. Each visit keeps its own dated note.`}
        icon={<MessageSquareText className="h-5 w-5 text-brand-700" />}
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

            <button type="button" className="btn-secondary" onClick={handleExportCsv}>
              <FileSpreadsheet className="h-4 w-4" />
              Export CSV
            </button>

            <Link to="/backup" className="btn-secondary">
              <Download className="h-4 w-4" />
              Encrypted backup
            </Link>

            <Link to="/shops" className="btn-primary">
              <Plus className="h-4 w-4" />
              Record a visit
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
              placeholder="Search shop name or words in your visit notes…"
              aria-label="Search visit records"
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

          <div className="relative">
            <Layers className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <select
              className="input min-w-[9.5rem] pl-9"
              value={filters.group}
              onChange={(event) => patch({ group: event.target.value as GroupMode })}
              aria-label="Group visit records"
            >
              <option value="date">Group by date</option>
              <option value="shop">Group by shop</option>
              <option value="none">No grouping</option>
            </select>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              patch({ direction: filters.direction === 'newest' ? 'oldest' : 'newest' })
            }
          >
            <ArrowDownUp className="h-4 w-4" />
            {filters.direction === 'newest' ? 'Newest first' : 'Oldest first'}
          </button>
        </div>

        {showFilters && (
          <div className="mt-3 grid gap-3 border-t border-ink-200 pt-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="visit-shop-filter">
                Filter by shop
              </label>
              <select
                id="visit-shop-filter"
                className="input"
                value={filters.shopId}
                onChange={(event) => patch({ shopId: event.target.value })}
              >
                <option value="">All shops</option>
                {shopsWithVisits.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="visit-from">
                From date
              </label>
              <div className="relative">
                <CalendarRange className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  id="visit-from"
                  type="date"
                  className="input pl-9"
                  value={filters.from}
                  onChange={(event) => patch({ from: event.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="visit-to">
                To date
              </label>
              <div className="relative">
                <CalendarRange className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  id="visit-to"
                  type="date"
                  className="input pl-9"
                  value={filters.to}
                  onChange={(event) => patch({ to: event.target.value })}
                />
              </div>
            </div>

            <div className="sm:col-span-3">
              <button type="button" className="btn-secondary" onClick={resetFilters}>
                <RotateCcw className="h-4 w-4" />
                Reset filters
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-500">
          {pluralize(filtered.length, 'visit record')}
          {filtered.length !== visits.length && ` of ${visits.length}`}
        </p>
        {filters.shopId && (
          <span className="badge-brand">
            Filtered to {shops.find((s) => s.id === filters.shopId)?.name ?? 'one shop'}
          </span>
        )}
      </div>

      {/* ---------------------------------- Results ---------------------------------- */}
      <div className="mt-3">
        <DataState
          loading={loading}
          error={error}
          locked={locked}
          onRetry={reload}
          empty={filtered.length === 0}
          emptyState={
            visits.length === 0 ? (
              <EmptyState
                icon={<Clock className="h-6 w-6" />}
                title="No visits recorded yet"
                description="Open a shop and tap “Mark Visit as Done” to save a dated note of what happened. Every visit is kept as a separate record."
                action={
                  <Link to="/shops" className="btn-primary btn-sm">
                    <Store className="h-3.5 w-3.5" />
                    Go to my shops
                  </Link>
                }
              />
            ) : (
              <EmptyState
                icon={<Search className="h-6 w-6" />}
                title="No visit records match your filters"
                description="Try a different word, widen the date range, or reset the filters."
                action={
                  <button type="button" className="btn-primary btn-sm" onClick={resetFilters}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset filters
                  </button>
                }
              />
            )
          }
        >
          {filters.group === 'date' && (
            <div className="space-y-6">
              {byDate.map((group) => (
                <section key={group.date}>
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-700">
                    <Clock className="h-4 w-4 text-brand-700" />
                    {formatDayHeading(group.date)}
                    <span className="badge-neutral">{group.visits.length}</span>
                  </h2>
                  <div className="space-y-3">
                    {group.visits.map((visit) => (
                      <VisitCard
                        key={visit.id}
                        visit={visit}
                        onEdit={(target) => {
                          setEditing(target)
                          setDialogOpen(true)
                        }}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {filters.group === 'shop' && (
            <div className="space-y-6">
              {byShop.map((group) => (
                <section key={group.shopId}>
                  <h2 className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold text-ink-700">
                    <Link
                      to={`/shops/${group.shopId}`}
                      className="flex items-center gap-2 hover:text-brand-700 hover:underline"
                    >
                      <Store className="h-4 w-4 text-brand-700" />
                      {group.shopName}
                    </Link>
                    <span className="badge-neutral">{group.visits.length}</span>
                  </h2>
                  <div className="space-y-3">
                    {group.visits.map((visit) => (
                      <VisitCard
                        key={visit.id}
                        visit={visit}
                        showShop={false}
                        onEdit={(target) => {
                          setEditing(target)
                          setDialogOpen(true)
                        }}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {filters.group === 'none' && (
            <div className={clsx('grid gap-3', 'lg:grid-cols-2')}>
              {filtered.map((visit) => (
                <VisitCard
                  key={visit.id}
                  visit={visit}
                  onEdit={(target) => {
                    setEditing(target)
                    setDialogOpen(true)
                  }}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </DataState>
      </div>

      <VisitDialog
        open={dialogOpen}
        shop={editShopForDialog}
        visit={editing}
        onClose={() => {
          setDialogOpen(false)
          setEditing(null)
        }}
        onSave={handleSaveEdit}
      />
    </>
  )
}
