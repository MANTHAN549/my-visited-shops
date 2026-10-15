/**
 * Domain types for My Visited Shops.
 *
 * The application works with these "domain" objects everywhere in the UI.
 * The database layer stores them in an encrypted envelope (see database/schema.ts
 * and services/githubCrypto.ts) so the persisted records in data.json remain
 * encrypted outside the app.
 */

/** A single owner / manager / staff contact for a shop. */
export interface ShopContact {
  id: string
  name: string
  /** Raw user supplied phone number (normalised only for links). */
  phone: string
  role?: ContactRole
  notes?: string
}

export type ContactRole = 'Owner' | 'Manager' | 'Staff' | 'Other'

export const CONTACT_ROLES: ContactRole[] = ['Owner', 'Manager', 'Staff', 'Other']

export const SHOP_CATEGORIES = [
  'Grocery',
  'Electronics',
  'Hardware',
  'Clothing',
  'Pharmacy',
  'Restaurant',
  'Bakery',
  'Stationery',
  'Furniture',
  'Auto Parts',
  'Mobile & Accessories',
  'Salon',
  'Service & Repair',
  'Wholesale',
  'Other',
] as const

export type ShopCategory = (typeof SHOP_CATEGORIES)[number] | string

/** A saved shop. */
export interface Shop {
  id: string
  name: string
  category: string
  address: string
  latitude: number
  longitude: number
  primaryOwnerName: string
  primaryOwnerPhone: string
  contacts: ShopContact[]
  notes: string
  tags: string[]
  /**
   * Small compressed image data URL (`data:image/...;base64,...`).
   * Stored inside the encrypted envelope, never as a separate readable row.
   */
  imageDataUrl?: string | null
  /** ISO-8601 timestamp, generated automatically. */
  createdAt: string
  /** ISO-8601 timestamp, updated on every edit. */
  updatedAt: string
  /** ISO-8601 timestamp of the most recent completed visit, or null. */
  lastVisitedAt: string | null
  /** Number of completed visit records. Kept in sync by visitService. */
  visitCount: number
}

/** A visit record ("shop message"). Always linked to a shop by `shopId`. */
export interface Visit {
  id: string
  shopId: string
  /** ISO-8601 timestamp of the visit itself. */
  visitedAt: string
  note: string
  purpose: string
  /** Free-form amount. Stored as a string to avoid float surprises in reporting. */
  amountSpent: string
  createdAt: string
  updatedAt: string
}

/** A visit joined with the (decrypted) shop it belongs to, for list rendering. */
export interface VisitWithShop extends Visit {
  shop: Shop | null
}

/** User-facing application settings, persisted in the encrypted GitHub document. */
export interface AppSettings {
  /** Use the alternative OpenTopoMap tile layer. */
  mapLayer: 'osm' | 'topo'
  /** Allow reverse geocoding (sends coordinates to the configured provider). */
  reverseGeocodingEnabled: boolean
  /** OSRM compatible base URL. */
  routingBaseUrl: string
  /** Preferred routing profile. */
  routingProfile: 'driving' | 'walking' | 'cycling'
  /** Nominatim compatible base URL, used only when reverse geocoding is enabled. */
  geocodingBaseUrl: string
  /** Auto lock after N minutes of inactivity. 0 disables auto lock. */
  autoLockMinutes: number
  /** Show the compact list first on small screens. */
  mobileListFirst: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  mapLayer: 'osm',
  reverseGeocodingEnabled: false,
  routingBaseUrl:
    (import.meta.env?.VITE_OSRM_BASE_URL as string | undefined) ||
    'https://router.project-osrm.org',
  routingProfile: 'driving',
  geocodingBaseUrl:
    (import.meta.env?.VITE_GEOCODING_BASE_URL as string | undefined) ||
    'https://nominatim.openstreetmap.org',
  autoLockMinutes: 15,
  mobileListFirst: true,
}

export const BACKUP_FORMAT_VERSION = 1

/** Backup file payload (the outer, unencrypted part of a backup file). */
export interface BackupFile {
  format: 'my-visited-shops-backup'
  version: number
  exportedAt: string
  encrypted: boolean
  /** Only present when encrypted === false. */
  data?: BackupPayload
  /** Only present when encrypted === true. */
  cipher?: {
    algorithm: 'AES-GCM'
    kdf: 'PBKDF2-SHA256'
    iterations: number
    salt: string
    iv: string
    /** base64 ciphertext of the JSON-stringified BackupPayload. */
    ciphertext: string
  }
  /** SHA-256 of the plaintext payload JSON, used for integrity checking. */
  integrity: string
  counts: { shops: number; visits: number }
  app: { name: string; version: string }
}

/** Decrypted backup contents. */
export interface BackupPayload {
  shops: Shop[]
  visits: Visit[]
  settings?: Partial<AppSettings>
  /** Present so a restored device can recreate the same envelope metadata. */
  encryption?: {
    enabled: boolean
    /** Only the salt + iterations are exported; the password is never exported. */
    salt?: string
    iterations?: number
  }
}

/** Result of a GPS lookup. */
export interface GeoPosition {
  latitude: number
  longitude: number
  /** Accuracy in metres as reported by the browser. */
  accuracy: number
  timestamp: number
}

/** Route returned by the routing provider. */
export interface RouteResult {
  distanceMeters: number
  durationSeconds: number
  /** GeoJSON LineString coordinates as [lat, lng] pairs (Leaflet order). */
  geometry: Array<[number, number]>
  provider: string
  profile: string
}

export type ToastKind = 'success' | 'error' | 'warning' | 'info'
