import { useCallback, useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import { createRoot, type Root } from 'react-dom/client'
import type { GeoPosition, RouteResult, Shop } from '@/types'
import {
  MAP_OPTIONS,
  createAccuracyCircle,
  createPickerIcon,
  createRouteLine,
  createShopIcon,
  createTileLayer,
  createUserIcon,
  fitToCoordinates,
} from './leafletHelpers'

/** Imperative helpers exposed to the page that owns the map. */
export interface MapApi {
  /** Centre the map on the user's position. Returns false when it is unknown. */
  recenterOnUser: () => boolean
  /** Fit the viewport to every shop marker. Returns false when there are none. */
  fitAll: () => boolean
  /** Access the underlying Leaflet instance (used for advanced controls). */
  getMap: () => L.Map | null
}

export interface MapViewProps {
  shops?: Shop[]
  center?: [number, number]
  zoom?: number
  /** Fit the viewport to all shop markers whenever the marker set changes. */
  fitToShops?: boolean
  activeShopId?: string | null
  onMarkerClick?: (shopId: string) => void
  userPosition?: GeoPosition | null
  showAccuracy?: boolean
  /** Editable marker used by the Add / Edit forms. */
  pickerPosition?: { latitude: number; longitude: number } | null
  onPickerMove?: (position: { latitude: number; longitude: number }) => void
  onMapClick?: (position: { latitude: number; longitude: number }) => void
  route?: RouteResult | null
  mapLayer?: 'osm' | 'topo'
  /** Rendered inside each marker's popup. Receives the shop. */
  renderPopup?: (shop: Shop) => React.ReactNode
  /** Receives the imperative helpers once the map is ready. */
  apiRef?: React.RefObject<MapApi | null>
  className?: string
  interactive?: boolean
}

/**
 * Reusable Leaflet map.
 *
 * The Leaflet instance is created once and only *patched* on prop changes, so the
 * map never flickers and the current viewport is preserved while the user works.
 * React content inside popups is mounted with `createRoot` and unmounted when the
 * popup closes, which keeps the preview card interactive (buttons, links).
 */
export function MapView({
  shops = [],
  center = [20.5937, 78.9629],
  zoom = 5,
  fitToShops = false,
  activeShopId = null,
  onMarkerClick,
  userPosition = null,
  showAccuracy = false,
  pickerPosition = null,
  onPickerMove,
  onMapClick,
  route = null,
  mapLayer = 'osm',
  renderPopup,
  apiRef,
  className = 'h-[22rem] w-full',
  interactive = true,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileRef = useRef<L.TileLayer | null>(null)
  const markersRef = useRef(new Map<string, L.Marker>())
  const popupRootsRef = useRef(new Map<string, Root>())
  const userMarkerRef = useRef<L.Marker | null>(null)
  const accuracyRef = useRef<L.Circle | null>(null)
  const pickerRef = useRef<L.Marker | null>(null)
  const routeRef = useRef<L.Polyline | null>(null)
  const fittedKeyRef = useRef('')

  const shopCoords = useMemo(
    () => shops.map((shop) => [shop.latitude, shop.longitude] as [number, number]),
    [shops],
  )

  /* -------------------------------------------------------------- */
  /* Init                                                            */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      ...MAP_OPTIONS,
      center,
      zoom,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      touchZoom: interactive,
    })

    tileRef.current = createTileLayer(mapLayer).addTo(map)
    mapRef.current = map

    return () => {
      for (const root of popupRootsRef.current.values()) root.unmount()
      popupRootsRef.current.clear()
      markersRef.current.clear()
      map.remove()
      mapRef.current = null
      tileRef.current = null
      userMarkerRef.current = null
      accuracyRef.current = null
      pickerRef.current = null
      routeRef.current = null
    }
    // Created once; every other prop is applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* -------------------------------------------------------------- */
  /* Tile layer swap                                                 */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (tileRef.current) map.removeLayer(tileRef.current)
    tileRef.current = createTileLayer(mapLayer).addTo(map)
  }, [mapLayer])

  /* -------------------------------------------------------------- */
  /* Markers                                                         */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const seen = new Set<string>()

    for (const shop of shops) {
      seen.add(shop.id)
      const isActive = shop.id === activeShopId
      const existing = markersRef.current.get(shop.id)

      if (existing) {
        existing.setLatLng([shop.latitude, shop.longitude])
        existing.setIcon(createShopIcon({ active: isActive }))
        continue
      }

      const marker = L.marker([shop.latitude, shop.longitude], {
        icon: createShopIcon({ active: isActive }),
        title: shop.name,
        riseOnHover: true,
      }).addTo(map)

      // The popup body is an empty mount point; React content is injected when
      // the popup opens, which keeps the marker HTML free of user text.
      marker.bindPopup('<div class="shop-popup-mount"></div>', {
        minWidth: 260,
        maxWidth: 280,
        autoPan: true,
      })

      marker.on('click', () => {
        onMarkerClick?.(shop.id)
      })

      marker.on('popupopen', () => {
        const node = marker.getPopup()?.getElement()?.querySelector('.shop-popup-mount')
        if (!node || !renderPopup) return
        const root = createRoot(node as HTMLElement)
        popupRootsRef.current.set(shop.id, root)
        root.render(renderPopup(shop) as React.ReactElement)
      })

      marker.on('popupclose', () => {
        const root = popupRootsRef.current.get(shop.id)
        if (!root) return
        // Defer unmounting: React warns if we unmount synchronously in the event.
        popupRootsRef.current.delete(shop.id)
        setTimeout(() => root.unmount(), 0)
      })

      markersRef.current.set(shop.id, marker)
    }

    // Remove markers for shops that no longer exist.
    for (const [id, marker] of Array.from(markersRef.current.entries())) {
      if (seen.has(id)) continue
      const root = popupRootsRef.current.get(id)
      if (root) {
        popupRootsRef.current.delete(id)
        setTimeout(() => root.unmount(), 0)
      }
      marker.remove()
      markersRef.current.delete(id)
    }
  }, [shops, activeShopId, onMarkerClick, renderPopup])

  /* -------------------------------------------------------------- */
  /* Fit to shops                                                    */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !fitToShops) return
    const key = shopCoords.map(([lat, lng]) => `${lat.toFixed(4)},${lng.toFixed(4)}`).join('|')
    if (key === fittedKeyRef.current) return
    fittedKeyRef.current = key
    if (!shopCoords.length) return
    fitToCoordinates(map, shopCoords)
  }, [fitToShops, shopCoords])

  /* -------------------------------------------------------------- */
  /* User position                                                   */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!userPosition) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove()
        userMarkerRef.current = null
      }
      if (accuracyRef.current) {
        accuracyRef.current.remove()
        accuracyRef.current = null
      }
      return
    }

    const latlng: [number, number] = [userPosition.latitude, userPosition.longitude]

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker(latlng, {
        icon: createUserIcon(),
        interactive: false,
        zIndexOffset: 500,
      }).addTo(map)
    } else {
      userMarkerRef.current.setLatLng(latlng)
    }

    if (showAccuracy) {
      if (!accuracyRef.current) {
        accuracyRef.current = createAccuracyCircle(userPosition).addTo(map)
      } else {
        accuracyRef.current.setLatLng(latlng)
        accuracyRef.current.setRadius(Math.max(userPosition.accuracy, 5))
      }
    } else if (accuracyRef.current) {
      accuracyRef.current.remove()
      accuracyRef.current = null
    }
  }, [userPosition, showAccuracy])

  /* -------------------------------------------------------------- */
  /* Picker marker                                                   */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!pickerPosition) {
      pickerRef.current?.remove()
      pickerRef.current = null
      return
    }

    const latlng: [number, number] = [pickerPosition.latitude, pickerPosition.longitude]
    const draggable = Boolean(onPickerMove)

    if (!pickerRef.current) {
      const marker = L.marker(latlng, {
        icon: createPickerIcon(),
        draggable,
        autoPan: true,
      }).addTo(map)

      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        onPickerMove?.({ latitude: pos.lat, longitude: pos.lng })
      })

      pickerRef.current = marker
    } else {
      pickerRef.current.setLatLng(latlng)
      if (draggable) pickerRef.current.dragging?.enable()
      else pickerRef.current.dragging?.disable()
    }
  }, [pickerPosition, onPickerMove])

  /* -------------------------------------------------------------- */
  /* Map click                                                       */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !onMapClick) return

    const handler = (event: L.LeafletMouseEvent) => {
      onMapClick({ latitude: event.latlng.lat, longitude: event.latlng.lng })
    }

    map.on('click', handler)
    return () => {
      map.off('click', handler)
    }
  }, [onMapClick])

  /* -------------------------------------------------------------- */
  /* Route polyline                                                  */
  /* -------------------------------------------------------------- */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (routeRef.current) {
      routeRef.current.remove()
      routeRef.current = null
    }

    if (!route?.geometry?.length) return

    routeRef.current = createRouteLine(route.geometry).addTo(map)
    fitToCoordinates(map, route.geometry, 17)
  }, [route])

  /* -------------------------------------------------------------- */
  /* Imperative API                                                  */
  /* -------------------------------------------------------------- */
  const recenterOnUser = useCallback(() => {
    const map = mapRef.current
    if (!map || !userPosition) return false
    map.setView([userPosition.latitude, userPosition.longitude], Math.max(map.getZoom(), 15), {
      animate: true,
    })
    return true
  }, [userPosition])

  const fitAll = useCallback(() => {
    const map = mapRef.current
    if (!map || !shopCoords.length) return false
    fitToCoordinates(map, shopCoords)
    return true
  }, [shopCoords])

  const getMap = useCallback(() => mapRef.current, [])

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = { recenterOnUser, fitAll, getMap }
  }, [apiRef, recenterOnUser, fitAll, getMap])

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
    </div>
  )
}
