/**
 * Location service - a thin, promise based wrapper around the browser
 * Geolocation API with explicit error handling.
 *
 * The app never silently substitutes an approximate position for a precise one:
 * whatever the browser reports (including its `accuracy`) is shown to the user,
 * and the accuracy radius is drawn on the map.
 */
import type { GeoPosition } from '@/types'

export type LocationErrorKind =
  | 'unsupported'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'insecure-context'
  | 'unknown'

export class LocationError extends Error {
  kind: LocationErrorKind

  constructor(kind: LocationErrorKind, message: string) {
    super(message)
    this.name = 'LocationError'
    this.kind = kind
  }
}

export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}

/** Browsers block geolocation on insecure origins (except localhost). */
export function isSecureContextForLocation(): boolean {
  if (typeof window === 'undefined') return true
  return window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

function toLocationError(error: GeolocationPositionError): LocationError {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return new LocationError(
        'denied',
        'Location permission was denied. Enable location access for this site in your browser settings, then try again.',
      )
    case error.POSITION_UNAVAILABLE:
      return new LocationError(
        'unavailable',
        'Your current position is unavailable right now. Move somewhere with a clearer view of the sky, or enter the coordinates manually.',
      )
    case error.TIMEOUT:
      return new LocationError(
        'timeout',
        'Getting your location timed out. Please try again, or enter the coordinates manually.',
      )
    default:
      return new LocationError('unknown', error.message || 'Unable to read your location.')
  }
}

export interface CurrentPositionOptions {
  /** Accept a cached fix up to this age (ms). Default 0 = always ask fresh. */
  maximumAge?: number
  /** Give up after this many ms. Default 15000. */
  timeout?: number
  /** Ask for the most accurate fix available (slower, better). Default true. */
  highAccuracy?: boolean
}

/** One-shot position request. */
export function getCurrentPosition(options: CurrentPositionOptions = {}): Promise<GeoPosition> {
  const { maximumAge = 0, timeout = 15_000, highAccuracy = true } = options

  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject(
        new LocationError(
          'unsupported',
          'This browser does not support location access. Enter the coordinates manually instead.',
        ),
      )
      return
    }
    if (!isSecureContextForLocation()) {
      reject(
        new LocationError(
          'insecure-context',
          'Location access needs a secure (https) connection. Open the app over https or on localhost.',
        ),
      )
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        })
      },
      (error) => reject(toLocationError(error)),
      { enableHighAccuracy: highAccuracy, timeout, maximumAge },
    )
  })
}

/** Continuous tracking. Always call the returned `stop()` on unmount. */
export function watchPosition(
  onUpdate: (position: GeoPosition) => void,
  onError: (error: LocationError) => void,
  options: CurrentPositionOptions = {},
): () => void {
  if (!isGeolocationSupported()) {
    onError(
      new LocationError(
        'unsupported',
        'This browser does not support location access, so live tracking is unavailable.',
      ),
    )
    return () => {}
  }
  if (!isSecureContextForLocation()) {
    onError(
      new LocationError('insecure-context', 'Live tracking needs a secure (https) connection.'),
    )
    return () => {}
  }

  const { maximumAge = 0, timeout = 20_000, highAccuracy = true } = options

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      onUpdate({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      })
    },
    (error) => onError(toLocationError(error)),
    { enableHighAccuracy: highAccuracy, timeout, maximumAge },
  )

  return () => navigator.geolocation.clearWatch(watchId)
}

/**
 * Reverse geocoding through a Nominatim compatible endpoint.
 *
 * Disabled by default: it sends the coordinates to a third party, so the UI asks
 * for permission first and explains exactly what leaves the device. The result is
 * only ever used to pre-fill the address field, which the user can edit.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  baseUrl: string,
  signal?: AbortSignal,
): Promise<string> {
  const url = new URL('/reverse', baseUrl.replace(/\/$/, ''))
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(latitude))
  url.searchParams.set('lon', String(longitude))
  url.searchParams.set('zoom', '18')
  url.searchParams.set('addressdetails', '1')

  const response = await fetch(url.toString(), {
    signal,
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Address lookup failed (HTTP ${response.status}). Enter the address manually.`)
  }

  const payload = (await response.json()) as {
    display_name?: string
    address?: Record<string, string>
  }

  const address = payload.address ?? {}
  const parts = [
    address.house_number,
    address.road || address.pedestrian || address.footway,
    address.neighbourhood || address.suburb,
    address.city || address.town || address.village || address.county,
    address.state,
    address.postcode,
    address.country,
  ].filter(Boolean)

  return parts.length ? parts.join(', ') : (payload.display_name ?? '')
}

/** Human readable accuracy label. */
export function describeAccuracy(accuracy: number): { label: string; tone: 'good' | 'ok' | 'poor' } {
  if (!Number.isFinite(accuracy)) return { label: 'unknown accuracy', tone: 'poor' }
  if (accuracy <= 15) return { label: `±${Math.round(accuracy)} m (excellent)`, tone: 'good' }
  if (accuracy <= 50) return { label: `±${Math.round(accuracy)} m (good)`, tone: 'good' }
  if (accuracy <= 150) return { label: `±${Math.round(accuracy)} m (fair - consider adjusting)`, tone: 'ok' }
  return { label: `±${Math.round(accuracy)} m (poor - adjust the marker manually)`, tone: 'poor' }
}

/** True when two fixes are close enough that redrawing the route is pointless. */
export function movedSignificantly(
  a: GeoPosition | null,
  b: GeoPosition,
  thresholdMeters = 75,
): boolean {
  if (!a) return true
  const R = 6371008.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))) >= thresholdMeters
}
