import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Clock,
  Compass,
  Crosshair,
  LayoutGrid,
  ListFilter,
  MapPin,
  Plus,
  Search,
  Store,
  X,
} from 'lucide-react'
import { DataState, EmptyState, PageHeader, Section, Spinner, StatCard } from '@/components/common'
import { MapView, type MapApi } from '@/components/maps/MapView'
import { ShopPopupCard } from '@/components/shops/ShopPopupCard'
import { ShopCard } from '@/components/shops/ShopCard'
import { useDashboardStats, useSettings, useShops, useVisits, useDebounced } from '@/hooks'
import { searchShops } from '@/services/shopService'
import { describeAccuracy, getCurrentPosition, LocationError } from '@/services/locationService'
import { useToast } from '@/app/providers'
import type { GeoPosition, Shop } from '@/types'

/**
 * Dashboard: the interactive map, search, recent sections and local statistics.
 *
 * Statistics are derived from the stored records only. Opening a shop or clicking
 * a marker never counts as a visit - only an explicit "Mark visit as done" does.
 */
export default function DashboardPage() {
  const navigate = useNavigate()
  const { success, error: toastError } = useToast()
  const { settings } = useSettings()

  const { shops, loading, error, locked, reload } = useShops()
  const { data: visits, loading: visitsLoading } = useVisits()
  const stats = useDashboardStats(shops, visits)

  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounced(query, 150)
  const [activeShopId, setActiveShopId] = useState<string | null>(null)
  const [userPosition, setUserPosition] = useState<GeoPosition | null>(null)
  const [locating, setLocating] = useState(false)
  const [showMapOnMobile, setShowMapOnMobile] = useState(true)

  const mapApiRef = useRef<MapApi | null>(null)

  const results = useMemo(() => searchShops(shops, debouncedQuery), [shops, debouncedQuery])

  const recentlyAdded = useMemo(
    () => [...shops].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4),
    [shops],
  )

  const recentlyVisited = useMemo(
    () =>
      [...shops]
        .filter((shop) => shop.lastVisitedAt)
        .sort((a, b) => (b.lastVisitedAt ?? '').localeCompare(a.lastVisitedAt ?? ''))
        .slice(0, 4),
    [shops],
  )

  const handleLocate = useCallback(async () => {
    setLocating(true)
    try {
      const position = await getCurrentPosition({ highAccuracy: true })
      setUserPosition(position)
      success('Location found', describeAccuracy(position.accuracy).label)
      return position
    } catch (err) {
      toastError('Could not read your location', (err as LocationError).message)
      return null
    } finally {
      setLocating(false)
    }
  }, [success, toastError])

  const handleRecenter = useCallback(async () => {
    if (mapApiRef.current?.recenterOnUser()) return
    const position = await handleLocate()
    if (position) {
      // The map re-renders with the new position; centre on the next tick.
      setTimeout(() => mapApiRef.current?.recenterOnUser(), 60)
    }
  }, [handleLocate])

  const openDirections = useCallback((shopId: string) => navigate(`/directions/${shopId}`), [navigate])

  const openDetails = useCallback((shopId: string) => navigate(`/shops/${shopId}`), [navigate])

  const renderPopup = useCallback(
    (shop: Shop) => (
      <ShopPopupCard shop={shop} onOpenDetails={openDetails} onDirections={openDirections} />
    ),
    [openDetails, openDirections],
  )

  const hasShops = shops.length > 0
  const searching = Boolean(debouncedQuery.trim())

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Every shop you have saved, on one map. Tap a pin to see the shop, call the owner or get directions."
        icon={<MapPin className="h-5 w-5 text-brand-700" />}
        actions={
          <>
            <button
              type="button"
              className="btn-secondary md:hidden"
              onClick={() => setShowMapOnMobile((value) => !value)}
            >
              {showMapOnMobile ? (
                <ListFilter className="h-4 w-4" />
              ) : (
                <LayoutGrid className="h-4 w-4" />
              )}
              {showMapOnMobile ? 'Show list' : 'Show map'}
            </button>
            <Link to="/add" className="btn-primary">
              <Plus className="h-4 w-4" />
              Add Shop
            </Link>
          </>
        }
      />

      {/* ------------------------------ Map + search ------------------------------ */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className={showMapOnMobile ? 'block' : 'hidden md:block'}>
          <div className="card overflow-hidden p-0">
            <div className="relative">
              <MapView
                apiRef={mapApiRef}
                className="h-[60vh] max-h-[34rem] min-h-[18rem] w-full"
                shops={results}
                activeShopId={activeShopId}
                onMarkerClick={setActiveShopId}
                userPosition={userPosition}
                showAccuracy
                fitToShops
                mapLayer={settings.mapLayer}
                renderPopup={renderPopup}
              />

              {/* Map controls */}
              <div className="absolute top-3 right-3 z-[500] flex flex-col gap-2">
                <button
                  type="button"
                  className="btn-secondary h-10 w-10 !p-0 shadow-md"
                  onClick={() => void handleRecenter()}
                  disabled={locating}
                  title="Centre the map on my current location"
                  aria-label="Centre the map on my current location"
                >
                  {locating ? <Spinner className="h-4 w-4" /> : <Crosshair className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  className="btn-secondary h-10 w-10 !p-0 shadow-md"
                  onClick={() => mapApiRef.current?.fitAll()}
                  title="Fit the map to all saved shops"
                  aria-label="Fit the map to all saved shops"
                >
                  <Compass className="h-4 w-4" />
                </button>
              </div>

              {!hasShops && !loading && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] p-3">
                  <div className="pointer-events-auto card flex flex-wrap items-center justify-between gap-2 p-3">
                    <p className="text-sm text-ink-600">
                      No shops saved yet. Add your first shop to see it here.
                    </p>
                    <Link to="/add" className="btn-primary btn-sm">
                      <Plus className="h-3.5 w-3.5" />
                      Add Shop
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-ink-200 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                <span className="inline-flex items-center gap-1">
                  <span className="h-3 w-3 rounded-full bg-brand-700" /> Saved shop
                </span>
                {userPosition && (
                  <>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-3 w-3 rounded-full bg-blue-600" /> You
                    </span>
                    <span>Accuracy {describeAccuracy(userPosition.accuracy).label}</span>
                  </>
                )}
                <span className="ml-auto">
                  {results.length} of {shops.length} shop{shops.length === 1 ? '' : 's'} shown
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ------------------------------- Search list ------------------------------- */}
        <div className={showMapOnMobile ? 'hidden md:block' : 'block'}>
          <div className="card p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                type="search"
                className="input pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, owner, phone, address, category, notes…"
                aria-label="Search your saved shops"
              />
              {query && (
                <button
                  type="button"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-ink-400 hover:bg-ink-100"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <p className="hint">
              Search runs entirely on this device — your shop records are never sent to a search
              service.
            </p>

            <div className="mt-3 max-h-[26rem] space-y-2 overflow-y-auto pr-1">
              <DataState
                loading={loading}
                error={error}
                locked={locked}
                onRetry={reload}
                empty={searching && results.length === 0}
                emptyState={
                  <EmptyState
                    icon={<Search className="h-6 w-6" />}
                    title="No matching shops"
                    description={`Nothing matches "${debouncedQuery}". Try a shorter word, or clear the search.`}
                    action={
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => setQuery('')}
                      >
                        Clear search
                      </button>
                    }
                    className="border-0 bg-transparent py-6"
                  />
                }
              >
                {results.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-500">
                    No shops saved yet. Use “Add Shop” to save your first one.
                  </p>
                ) : (
                  results.map((shop) => (
                    <button
                      key={shop.id}
                      type="button"
                      onClick={() => {
                        setActiveShopId(shop.id)
                        navigate(`/shops/${shop.id}`)
                      }}
                      className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                        activeShopId === shop.id
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-ink-200 hover:border-brand-300 hover:bg-ink-50'
                      }`}
                    >
                      <p className="truncate text-sm font-medium text-ink-900">{shop.name}</p>
                      <p className="truncate text-xs text-ink-500">
                        {shop.address ||
                          `${shop.latitude.toFixed(4)}, ${shop.longitude.toFixed(4)}`}
                      </p>
                      <p className="mt-0.5 text-[0.6875rem] text-ink-400">
                        {shop.category || 'Uncategorised'} · {shop.visitCount ?? 0} visit
                        {(shop.visitCount ?? 0) === 1 ? '' : 's'}
                      </p>
                    </button>
                  ))
                )}
              </DataState>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------- Statistics -------------------------------- */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total saved shops"
          value={stats.totalShops}
          icon={<Store className="h-5 w-5" />}
          tone="brand"
          onClick={() => navigate('/shops')}
        />
        <StatCard
          label="Shops visited"
          value={stats.visitedShops}
          icon={<MapPin className="h-5 w-5" />}
          onClick={() => navigate('/shops?visited=visited')}
        />
        <StatCard
          label="Never visited"
          value={stats.neverVisitedShops}
          icon={<Search className="h-5 w-5" />}
          tone="slate"
          onClick={() => navigate('/shops?visited=never')}
        />
        <StatCard
          label="Visit records"
          value={stats.totalVisits}
          icon={<Clock className="h-5 w-5" />}
          tone="amber"
          onClick={() => navigate('/visits')}
        />
      </div>

      {/* --------------------------- Recently added / visited --------------------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Recently added shops"
          action={
            shops.length > 4 ? (
              <Link to="/shops?sort=recent" className="link text-xs">
                View all
              </Link>
            ) : null
          }
        >
          <DataState
            loading={loading}
            error={error}
            locked={locked}
            onRetry={reload}
            empty={recentlyAdded.length === 0}
            emptyState={
              <EmptyState
                title="No shops yet"
                description="Save the first shop you visit and it will appear here, sorted by the date you added it."
                action={
                  <Link to="/add" className="btn-primary btn-sm">
                    <Plus className="h-3.5 w-3.5" />
                    Add your first shop
                  </Link>
                }
              />
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {recentlyAdded.map((shop) => (
                <ShopCard key={shop.id} shop={shop} variant="grid" onDirections={openDirections} />
              ))}
            </div>
          </DataState>
        </Section>

        <Section
          title="Recently visited shops"
          action={
            recentlyVisited.length > 4 ? (
              <Link to="/shops?sort=visited" className="link text-xs">
                View all
              </Link>
            ) : null
          }
        >
          <DataState
            loading={loading || visitsLoading}
            error={error}
            locked={locked}
            onRetry={reload}
            empty={recentlyVisited.length === 0}
            emptyState={
              <EmptyState
                icon={<Clock className="h-6 w-6" />}
                title="No visits recorded yet"
                description="Open a shop and tap “Mark Visit as Done” to keep a dated note of what happened."
              />
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {recentlyVisited.map((shop) => (
                <ShopCard key={shop.id} shop={shop} variant="grid" onDirections={openDirections} />
              ))}
            </div>
          </DataState>
        </Section>
      </div>
    </>
  )
}
