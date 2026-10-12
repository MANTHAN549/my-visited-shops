/** Formatting / misc helpers shared across pages. */

/** ISO string for "now". */
export function nowIso(): string {
  return new Date().toISOString()
}

/** Create a collision resistant id that also sorts roughly by creation time. */
export function createId(prefix = 'id'): string {
  const time = Date.now().toString(36)
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14)
  return `${prefix}_${time}_${rand}`
}

/** `12 Oct 2026` */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

/** `12 Oct 2026, 14:35` */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** `Today, 14:35` / `Yesterday, 09:10` / `12 Oct 2026, 14:35` */
export function formatRelativeDay(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(d, today)) return `Today, ${time}`
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (sameDay(d, yesterday)) return `Yesterday, ${time}`
  return `${formatDate(iso)}, ${time}`
}

/** `YYYY-MM-DD` in local time (for grouping and file names). */
export function toDateKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Long day heading used for date groups: `Monday, 12 October 2026`. */
export function formatDayHeading(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return dateKey
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** `2.4 km` / `320 m` */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(meters < 10000 ? 2 : 1)} km`
}

/** `8 min` / `1 h 05 min` */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  const total = Math.round(seconds / 60)
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h} h ${String(m).padStart(2, '0')} min`
}

/** Haversine distance in metres. Used for "nearest" sorting and duplicate hints. */
export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371008.8
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Human readable coordinate pair. */
export function formatCoords(latitude: number, longitude: number, digits = 6): string {
  return `${latitude.toFixed(digits)}, ${longitude.toFixed(digits)}`
}

/** Initials used by the default shop avatar. */
export function initials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?'
}

/** Deterministic pastel colour for a shop avatar, derived from its id. */
export function avatarColor(seed: string): string {
  const palette = [
    '#0f766e',
    '#1d4ed8',
    '#b45309',
    '#be123c',
    '#6d28d9',
    '#047857',
    '#c2410c',
    '#0e7490',
    '#a21caf',
    '#4d7c0f',
  ]
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 100000
  return palette[hash % palette.length]
}

/** `1 shop` / `3 shops` */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** Parse a tag string (`a, b c`) into a normalised, de-duplicated array. */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const tag of (raw || '').split(/[,\n]/)) {
    const t = tag.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out.slice(0, 20)
}

/** Truncate long text for cards. */
export function truncate(text: string, max = 120): string {
  const t = (text || '').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).trimEnd()}…`
}

/** Build a Google Maps directions URL (external navigation fallback). */
export function googleMapsDirectionsUrl(
  destination: { latitude: number; longitude: number; name?: string },
  origin?: { latitude: number; longitude: number } | null,
  mode: 'driving' | 'walking' | 'bicycling' | 'transit' = 'driving',
): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${destination.latitude},${destination.longitude}`,
    travelmode: mode,
  })
  if (origin) params.set('origin', `${origin.latitude},${origin.longitude}`)
  else params.set('origin', 'Current+Location')
  if (destination.name) params.set('destination_place_id', '')
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

/** OpenStreetMap external fallback (no key, works on desktop and mobile). */
export function osmDirectionsUrl(
  destination: { latitude: number; longitude: number },
  origin?: { latitude: number; longitude: number } | null,
): string {
  const route = origin
    ? `${origin.latitude},${origin.longitude};${destination.latitude},${destination.longitude}`
    : `${destination.latitude},${destination.longitude}`
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(route)}`
}

/** Geo URI, understood by many native map applications. */
export function geoUri(
  destination: { latitude: number; longitude: number; name?: string },
): string {
  const label = destination.name ? `(${encodeURIComponent(destination.name)})` : ''
  return `geo:${destination.latitude},${destination.longitude}?q=${destination.latitude},${destination.longitude}${label}`
}

/** Days between two ISO dates (positive when `to` is after `from`). */
export function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

/** Debounce helper for the search inputs. */
export function debounce<T extends (...args: never[]) => void>(fn: T, wait = 200) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}
