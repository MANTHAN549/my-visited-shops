/**
 * Leaflet helpers.
 *
 * Markers are built with `L.divIcon` instead of Leaflet's default PNG icons.
 * Two reasons: the default icon URLs break when the bundle is served from a
 * sub-path (they are resolved relative to the CSS), and div icons let the pin
 * carry the app's own styling without extra assets.
 */
import L from 'leaflet'
import type { GeoPosition } from '@/types'

export const OSM_TILE_URL =
  (import.meta.env.VITE_TILE_URL as string | undefined) ||
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener">OpenStreetMap</a> contributors'

export const TOPO_TILE_URL = 'https://tile.opentopomap.org/{z}/{x}/{y}.png'
export const TOPO_ATTRIBUTION =
  'Map data &copy; OpenStreetMap contributors, SRTM | Map style &copy; <a href="https://opentopomap.org" target="_blank" rel="noreferrer noopener">OpenTopoMap</a> (CC-BY-SA)'

export function createTileLayer(layer: 'osm' | 'topo'): L.TileLayer {
  return layer === 'topo'
    ? L.tileLayer(TOPO_TILE_URL, {
        attribution: TOPO_ATTRIBUTION,
        maxZoom: 17,
        crossOrigin: true,
      })
    : L.tileLayer(OSM_TILE_URL, {
        attribution: OSM_ATTRIBUTION,
        maxZoom: 19,
        crossOrigin: true,
      })
}

/** Teardrop pin for a saved shop. `active` makes it larger and red. */
export function createShopIcon(options: { active?: boolean; label?: string } = {}): L.DivIcon {
  const { active = false, label = '' } = options
  const size = active ? 28 : 24

  return L.divIcon({
    className: `shop-pin${active ? ' shop-pin--active' : ''}`,
    html: `<div class="shop-pin__dot"><span>${escapeHtml(label)}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  })
}

/** Blue pulsing dot for the user's current position. */
export function createUserIcon(): L.DivIcon {
  return L.divIcon({
    className: 'user-dot',
    html: '<div class="user-dot__pulse"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

/** Neutral pin used by the location picker in the Add / Edit form. */
export function createPickerIcon(): L.DivIcon {
  return L.divIcon({
    className: 'shop-pin shop-pin--active',
    html: '<div class="shop-pin__dot"><span>+</span></div>',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  })
}

/** Circle showing the GPS accuracy radius (never hide it: it is information). */
export function createAccuracyCircle(position: GeoPosition): L.Circle {
  return L.circle([position.latitude, position.longitude], {
    radius: Math.max(position.accuracy, 5),
    color: '#2563eb',
    weight: 1,
    fillColor: '#2563eb',
    fillOpacity: 0.1,
    interactive: false,
  })
}

/** Style for the route polyline. */
export function createRouteLine(geometry: Array<[number, number]>): L.Polyline {
  return L.polyline(geometry, {
    color: '#0f766e',
    weight: 5,
    opacity: 0.85,
    lineJoin: 'round',
    lineCap: 'round',
  })
}

/** Escape user text before it goes into an HTML string (divIcon / popup shell). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Fit bounds around a set of coordinates with a comfortable padding. */
export function fitToCoordinates(map: L.Map, coords: Array<[number, number]>, maxZoom = 16): void {
  if (!coords.length) return
  if (coords.length === 1) {
    map.setView(coords[0], maxZoom)
    return
  }
  map.fitBounds(L.latLngBounds(coords.map(([lat, lng]) => L.latLng(lat, lng))), {
    padding: [48, 48],
    maxZoom,
  })
}

/** Leaflet's own zoom control is replaced by buttons in the app UI. */
export const MAP_OPTIONS: L.MapOptions = {
  zoomControl: false,
  attributionControl: true,
  preferCanvas: true,
  worldCopyJump: true,
}
