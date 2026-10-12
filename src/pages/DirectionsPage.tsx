import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  Car,
  Footprints,
  Info,
  LocateFixed,
  Navigation,
  Phone,
  RefreshCw,
  Store,
  X,
} from 'lucide-react'
import { clsx } from 'clsx'
import { DataState, EmptyState, Spinner } from '@/components/common'
import { MapView, type MapApi } from '@/components/maps/MapView'
import { useSettings, useShop } from '@/hooks'
import {
  describeAccuracy,
  getCurrentPosition,
  watchPosition,
  LocationError,
} from '@/services/locationService'
import {
  fetchRoute,
  RoutingError,
  shouldRecalculate,
  type TravelProfile,
} from '@/services/routingService'
import { useToast } from '@/app/providers'
import type { GeoPosition, RouteResult } from '@/types'
import {
  formatDistance,
  formatDuration,
  geoUri,
  googleMapsDirectionsUrl,
  osmDirectionsUrl,
} from '@/utils/format'
import { formatPhoneDisplay, toTelHref, toWhatsAppHref } from '@/utils/phone'

/**
 * Full-screen directions.
 *
 * Behaviour that is deliberately implemented this way:
 *  - The route comes from the configured provider; distance and duration are only
 *    ever shown when the provider actually returned them.
 *  - Live tracking is opt-in, and a GPS update does NOT trigger a new route
 *    request. The route is recalculated only when the user asks.
 *  - This is not turn-by-turn navigation. When the provider fails or is
 *    unavailable, an external navigation app is offered instead.
 */
export default function DirectionsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { success, error: toastError, warning } = useToast()
  const { settings } = useSettings()

  const { data: shop, loading, error, locked, reload } = useShop(id)

  const [profile, setProfile] = useState<TravelProfile>(settings.routingProfile)
  const [userPosition, setUserPosition] = useState<GeoPosition | null>(null)
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [locating, setLocating] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  const mapApiRef = useRef<MapApi | null>(null)
  const lastRouteOriginRef = useRef<{ latitude: number; longitude: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const stopWatchRef = useRef<(() => void) | null>(null)

  /* ------------------------------ geolocation ------------------------------ */

  const locateOnce = useCallback(
    async (silent = false) => {
      setLocating(true)
      setLocationError(null)
      try {
        const position = await getCurrentPosition({ highAccuracy: true })
        setUserPosition(position)
        if (!silent) success('Location found', describeAccuracy(position.accuracy).label)
        return position
      } catch (err) {
        const message = (err as LocationError).message
        setLocationError(message)
        if (!silent) toastError('Could not read your location', message)
        return null
      } finally {
        setLocating(false)
      }
    },
    [success, toastError],
  )

  /* -------------------------------- routing -------------------------------- */

  const calculateRoute = useCallback(
    async (origin: GeoPosition, options: { announce?: boolean } = {}) => {
      if (!shop) return

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setCalculating(true)
      setRouteError(null)

      try {
        const result = await fetchRoute({
          origin: { latitude: origin.latitude, longitude: origin.longitude },
          destination: { latitude: shop.latitude, longitude: shop.longitude },
          profile,
          baseUrl: settings.routingBaseUrl,
          signal: controller.signal,
        })

        setRoute(result)
        lastRouteOriginRef.current = { latitude: origin.latitude, longitude: origin.longitude }

        if (options.announce) {
          success(
            'Route ready',
            `${formatDistance(result.distanceMeters)} · about ${formatDuration(result.durationSeconds)}`,
          )
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return

        const routingError = err as RoutingError
        setRoute(null)
        setRouteError(routingError.message)
      } finally {
        setCalculating(false)
      }
    },
    [shop, profile, settings.routingBaseUrl, success],
  )

  // Calculate once when the shop and the first fix are both available.
  const autoCalculatedRef = useRef(false)

  useEffect(() => {
    if (autoCalculatedRef.current || !shop || !userPosition) return
    autoCalculatedRef.current = true
    void calculateRoute(userPosition)
  }, [shop, userPosition, calculateRoute])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      stopWatchRef.current?.()
    }
  }, [])

  // Ask for a first fix on arrival. A denial is reported, never hidden.
  useEffect(() => {
    void locateOnce(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------------------------- live tracking ---------------------------- */

  function startTracking() {
    if (stopWatchRef.current) return
    setTracking(true)

    stopWatchRef.current = watchPosition(
      (position) => {
        setUserPosition(position)
        // Intentionally do NOT recalculate the route on every update.
      },
      (err) => {
        setLocationError(err.message)
        setTracking(false)
        stopWatchRef.current = null
      },
      { highAccuracy: true, maximumAge: 2_000 },
    )
  }

  function stopTracking() {
    stopWatchRef.current?.()
    stopWatchRef.current = null
    setTracking(false)
  }

  useEffect(() => () => stopWatchRef.current?.(), [])

  /** Recalculate only when the user asked; warn when nothing has really changed. */
  function handleRecalculate() {
    if (!userPosition) {
      void locateOnce().then((position) => {
        if (position) void calculateRoute(position, { announce: true })
      })
      return
    }

    if (route && !shouldRecalculate(lastRouteOriginRef.current, userPosition)) {
      warning('You have barely moved', 'Recalculating anyway since you asked for it.')
    }

    void calculateRoute(userPosition, { announce: true })
  }

  function handleClose() {
    stopTracking()
    abortRef.current?.abort()
    navigate(shop ? `/shops/${shop.id}` : '/')
  }

  const hasRoute = Boolean(route)

  const externalLinks = useMemo(() => {
    if (!shop) return null
    const destination = { latitude: shop.latitude, longitude: shop.longitude, name: shop.name }
    return {
      google: googleMapsDirectionsUrl(
        destination,
        userPosition,
        profile === 'walking' ? 'walking' : profile === 'cycling' ? 'bicycling' : 'driving',
      ),
      osm: osmDirectionsUrl(destination, userPosition),
      geo: geoUri(destination),
    }
  }, [shop, userPosition, profile])

  const telHref = shop ? toTelHref(shop.primaryOwnerPhone) : ''
  const waHref = shop
    ? toWhatsAppHref(shop.primaryOwnerPhone, `Hello, I am on my way to ${shop.name}.`)
    : ''

  return (
    <div className="fixed inset-0 z-[900] flex flex-col bg-ink-50">
      {/* ------------------------------- Top bar ------------------------------- */}
      <div className="flex items-center gap-2 border-b border-ink-200 bg-white px-3 py-2">
        <button type="button" className="btn-secondary btn-sm" onClick={handleClose}>
          <X className="h-4 w-4" />
          Close Navigation
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-900">{shop?.name ?? 'Directions'}</p>
          {shop?.address && <p className="truncate text-xs text-ink-500">{shop.address}</p>}
        </div>

        <div className="hidden items-center gap-1 rounded-lg border border-ink-300 p-0.5 sm:flex">
          {(['driving', 'walking', 'cycling'] as TravelProfile[]).map((option) => (
            <button
              key={option}
              type="button"
              className={clsx(
                'flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium',
                profile === option ? 'bg-brand-700 text-white' : 'text-ink-600 hover:bg-ink-100',
              )}
              onClick={() => setProfile(option)}
              aria-pressed={profile === option}
            >
              {option === 'driving' && <Car className="h-3.5 w-3.5" />}
              {option === 'walking' && <Footprints className="h-3.5 w-3.5" />}
              {option === 'cycling' && <Navigation className="h-3.5 w-3.5" />}
              {option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------- Map ------------------------------- */}
      <div className="relative flex-1">
        <DataState loading={loading} error={error} locked={locked} onRetry={reload}>
          {!shop ? (
            <div className="flex h-full items-center justify-center p-4">
              <EmptyState
                title="Shop not found"
                description="This shop may have been deleted, so there is nothing to navigate to."
                action={
                  <Link to="/shops" className="btn-primary btn-sm">
                    Back to all shops
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="absolute inset-0">
              <MapView
                apiRef={mapApiRef}
                className="h-full w-full"
                shops={[shop]}
                activeShopId={shop.id}
                center={[shop.latitude, shop.longitude]}
                zoom={14}
                userPosition={userPosition}
                showAccuracy
                route={route}
                mapLayer={settings.mapLayer}
              />

              {/* Floating controls */}
              <div className="absolute top-3 right-3 z-[500] flex flex-col gap-2">
                <button
                  type="button"
                  className="btn-secondary h-11 w-11 !p-0 shadow-md"
                  onClick={() => {
                    if (mapApiRef.current?.recenterOnUser()) return
                    void locateOnce().then(() => setTimeout(() => mapApiRef.current?.recenterOnUser(), 60))
                  }}
                  disabled={locating}
                  title="Centre on my location"
                  aria-label="Centre on my location"
                >
                  {locating ? <Spinner className="h-4 w-4" /> : <LocateFixed className="h-5 w-5" />}
                </button>

                <button
                  type="button"
                  className="btn-secondary h-11 w-11 !p-0 shadow-md"
                  onClick={handleRecalculate}
                  disabled={calculating}
                  title="Recalculate the route"
                  aria-label="Recalculate the route"
                >
                  {calculating ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-5 w-5" />}
                </button>
              </div>

              {/* Route summary */}
              <div className="absolute top-3 left-3 z-[500] max-w-[16rem]">
                <div className="card p-3">
                  {calculating && !hasRoute && (
                    <p className="flex items-center gap-2 text-sm text-ink-600">
                      <Spinner className="h-4 w-4" />
                      Calculating route…
                    </p>
                  )}

                  {hasRoute && route && (
                    <>
                      <p className="text-lg font-semibold text-ink-900">
                        {formatDistance(route.distanceMeters)}
                      </p>
                      <p className="text-sm text-ink-600">
                        about {formatDuration(route.durationSeconds)}
                      </p>
                      <p className="mt-1 text-[0.6875rem] text-ink-400">
                        via {route.provider} · profile {route.profile}
                      </p>
                    </>
                  )}

                  {!hasRoute && !calculating && routeError && (
                    <p className="flex items-start gap-2 text-xs text-amber-800">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      {routeError}
                    </p>
                  )}

                  {!hasRoute && !calculating && !routeError && !userPosition && (
                    <p className="text-xs text-ink-600">
                      Waiting for your location before calculating a route.
                    </p>
                  )}

                  {locationError && <p className="mt-2 text-xs text-red-700">{locationError}</p>}

                  {tracking && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-700">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-brand-600" />
                      Live tracking on
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DataState>
      </div>

      {/* ------------------------------- Bottom card ------------------------------- */}
      {shop && (
        <div className="border-t border-ink-200 bg-white p-3 safe-bottom">
          <div className="mx-auto max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink-900">
                  <Store className="h-4 w-4 shrink-0 text-brand-700" />
                  {shop.name}
                </p>
                <p className="truncate text-xs text-ink-500">
                  {shop.address || `${shop.latitude.toFixed(5)}, ${shop.longitude.toFixed(5)}`}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Link to={`/shops/${shop.id}`} className="btn-secondary btn-sm">
                  Shop details
                </Link>

                {telHref && (
                  <a href={telHref} className="btn-primary btn-sm">
                    <Phone className="h-3.5 w-3.5" />
                    Call {shop.primaryOwnerName ? shop.primaryOwnerName.split(' ')[0] : 'owner'}
                  </a>
                )}

                {waHref && (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="btn-whatsapp btn-sm"
                  >
                    WhatsApp
                  </a>
                )}
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={tracking ? stopTracking : startTracking}
              >
                <LocateFixed className="h-3.5 w-3.5" />
                {tracking ? 'Stop Tracking' : 'Live tracking'}
              </button>

              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={handleRecalculate}
                disabled={calculating}
              >
                {calculating ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Recalculate
              </button>

              {externalLinks && (
                <>
                  <a
                    href={externalLinks.google}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="btn-secondary btn-sm"
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    Google Maps
                  </a>
                  <a
                    href={externalLinks.osm}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="btn-secondary btn-sm"
                  >
                    OpenStreetMap
                  </a>
                  <a href={externalLinks.geo} className="btn-ghost btn-sm">
                    Open in map app
                  </a>
                </>
              )}
            </div>

            <p className="mt-2 flex items-start gap-1.5 text-[0.6875rem] text-ink-400">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              This screen shows a route line and an estimate. It is not turn-by-turn navigation — for
              voice guidance and background navigation, open Google Maps or your installed navigation
              app.{' '}
              {shop.primaryOwnerPhone && `Owner: ${formatPhoneDisplay(shop.primaryOwnerPhone)}.`}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
