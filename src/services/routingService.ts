/**
 * Routing service - OSRM compatible.
 *
 * Leaflet renders maps but does not compute road routes, so an external routing
 * provider is required. This module:
 *   - uses a configurable OSRM base URL (default: the public demo server),
 *   - requests a route only when asked (never on every GPS tick),
 *   - never hardcodes distance, duration or geometry,
 *   - falls back to an external navigation app when the provider fails,
 *   - respects the provider by not polling.
 *
 * Note on the public demo server (router.project-osrm.org): it is a shared,
 * best-effort service with no uptime guarantee and a fair-use rate limit. For
 * heavier personal use, point `routingBaseUrl` in Settings at your own OSRM
 * instance. No API key is ever embedded in the bundle.
 */
import type { RouteResult } from '@/types'

export type TravelProfile = 'driving' | 'walking' | 'cycling'

/** OSRM profile names differ between builds; try the common ones in order. */
const OSRM_PROFILE_CANDIDATES: Record<TravelProfile, string[]> = {
  driving: ['driving', 'car'],
  walking: ['foot', 'walking'],
  cycling: ['bike', 'cycling', 'bicycle'],
}

export class RoutingError extends Error {
  /** True when the failure is expected to be temporary (network / 5xx / rate limit). */
  retryable: boolean

  constructor(message: string, retryable = true) {
    super(message)
    this.name = 'RoutingError'
    this.retryable = retryable
  }
}

interface OsrmRoute {
  distance: number
  duration: number
  geometry: { coordinates: [number, number][]; type: string }
}

interface OsrmResponse {
  code: string
  message?: string
  routes?: OsrmRoute[]
}

export interface RouteRequest {
  origin: { latitude: number; longitude: number }
  destination: { latitude: number; longitude: number }
  profile: TravelProfile
  baseUrl: string
  signal?: AbortSignal
}

/**
 * Request a route from the provider.
 *
 * Throws `RoutingError` with `retryable = false` for a definitive "no route"
 * answer, and `retryable = true` for network / server problems so the UI can
 * offer a retry button and the external fallback.
 */
export async function fetchRoute(request: RouteRequest): Promise<RouteResult> {
  const { origin, destination, profile, baseUrl, signal } = request

  const root = (baseUrl || '').trim().replace(/\/$/, '')
  if (!root) {
    throw new RoutingError('No routing service is configured. Add one in Settings.', false)
  }

  const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`
  const candidates = OSRM_PROFILE_CANDIDATES[profile] ?? OSRM_PROFILE_CANDIDATES.driving

  let lastError: Error | null = null

  for (const candidate of candidates) {
    const url = `${root}/route/v1/${candidate}/${coordinates}?overview=full&geometries=geojson&steps=false`

    try {
      const response = await fetch(url, {
        signal,
        headers: { Accept: 'application/json' },
      })

      if (response.status === 429) {
        throw new RoutingError(
          'The routing service is rate limiting requests. Wait a moment, then retry - or open external navigation.',
          true,
        )
      }

      if (!response.ok) {
        // A 400 often means this OSRM build does not host that profile; try the next name.
        lastError = new RoutingError(`Routing service returned HTTP ${response.status}.`, true)
        continue
      }

      const payload = (await response.json()) as OsrmResponse

      if (payload.code !== 'Ok') {
        if (payload.code === 'NoRoute') {
          throw new RoutingError(
            'The routing service could not find a route between these points.',
            false,
          )
        }
        lastError = new RoutingError(
          payload.message || `Routing service responded with "${payload.code}".`,
          true,
        )
        continue
      }

      const route = payload.routes?.[0]
      if (!route || !route.geometry?.coordinates?.length) {
        lastError = new RoutingError('The routing service returned an empty route.', true)
        continue
      }

      return {
        distanceMeters: route.distance,
        durationSeconds: route.duration,
        // GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
        geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
        provider: new URL(root).host,
        profile: candidate,
      }
    } catch (error) {
      if (signal?.aborted) throw error
      if (error instanceof RoutingError) {
        if (!error.retryable) throw error
        lastError = error
        continue
      }
      lastError = new RoutingError(
        'Could not reach the routing service. Check your internet connection and retry.',
        true,
      )
    }
  }

  throw (
    lastError ??
    new RoutingError('No routing service could calculate a route for these points.', true)
  )
}

/**
 * Guard used by the directions screen: only recalculate when the user has moved
 * far enough for the route to be meaningfully different, or when they ask.
 */
export function shouldRecalculate(
  lastOrigin: { latitude: number; longitude: number } | null,
  next: { latitude: number; longitude: number },
  thresholdMeters = 120,
): boolean {
  if (!lastOrigin) return true
  const R = 6371008.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(next.latitude - lastOrigin.latitude)
  const dLon = toRad(next.longitude - lastOrigin.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lastOrigin.latitude)) * Math.cos(toRad(next.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))) >= thresholdMeters
}

/** Straight-line fallback used only for display when routing is unavailable. */
export function straightLineGeometry(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
): Array<[number, number]> {
  return [
    [origin.latitude, origin.longitude],
    [destination.latitude, destination.longitude],
  ]
}
