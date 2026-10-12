/**
 * Database schema definition.
 *
 * ---------------------------------------------------------------------------
 * IMPORTANT - WHAT IS STORED IN PLAINTEXT
 * ---------------------------------------------------------------------------
 * Records live in an "encrypted envelope": a small set of *index* fields stays
 * readable so IndexedDB can sort and filter efficiently, and everything else
 * (name, address, coordinates, phone numbers, notes, visit messages, images)
 * is serialised to JSON and encrypted with AES-GCM.
 *
 * Readable index fields - shops:  id, createdAt, updatedAt, lastVisitedAt, visitCount
 * Readable index fields - visits: id, shopId, visitedAt, createdAt
 *
 * Consequently, free text search (shop name, owner, phone, address, category,
 * notes, visit notes) cannot run inside IndexedDB while encrypted mode is on.
 * The app therefore loads the records, decrypts them in memory and searches
 * there. That is a deliberate trade-off: the dataset is personal and small, and
 * keeping text searchable would mean keeping it unencrypted.
 *
 * The `v` column is the envelope version, so a future release can change the
 * encryption format and migrate lazily on read.
 */
import type { KeyValueRecord, ShopRecord, SyncQueueRecord, SyncStateRecord, VisitRecord } from '@/types'

export const DB_NAME = 'my-visited-shops'

/**
 * Bump this and add a `.version(n)` block in migrations.ts whenever the store
 * definitions or the envelope shape change.
 */
export const DB_VERSION = 2

export interface MyVisitedShopsDB {
  shops: ShopRecord
  visits: VisitRecord
  meta: KeyValueRecord
  syncQueue: SyncQueueRecord
  syncState: SyncStateRecord
}

/** Index strings consumed by `Dexie.version().stores()`. */
export const STORES = {
  // Compound index on [visitCount+lastVisitedAt] powers the "most visited" sort
  // without decrypting every record.
  shops: 'id, createdAt, updatedAt, lastVisitedAt, visitCount, [visitCount+lastVisitedAt]',
  visits: 'id, shopId, visitedAt, createdAt, [shopId+visitedAt]',
  meta: 'key',
  syncQueue: 'id, entity, recordId, operation, queuedAt',
  syncState: 'id, entity, recordId, revision, updatedAt',
} as const

/** Keys used in the `meta` table. */
export const META_KEYS = {
  encryption: 'encryption',
  settings: 'settings',
  install: 'install',
  schemaInfo: 'schemaInfo',
  cloudEncryption: 'cloudEncryption',
} as const

/**
 * Columns that are intentionally readable. Kept here so the UI / docs can state
 * the privacy trade-off precisely and so tests can assert nothing else leaks.
 */
export const PLAINTEXT_INDEX_FIELDS: Record<keyof MyVisitedShopsDB, string[]> = {
  shops: ['id', 'createdAt', 'updatedAt', 'lastVisitedAt', 'visitCount', 'enc', 'data', 'iv', 'v'],
  visits: ['id', 'shopId', 'visitedAt', 'createdAt', 'updatedAt', 'enc', 'data', 'iv', 'v'],
  meta: ['key', 'value', 'updatedAt'],
  syncQueue: ['id', 'entity', 'recordId', 'operation', 'queuedAt'],
  syncState: ['id', 'entity', 'recordId', 'revision', 'updatedAt'],
}

/**
 * Fields that are NEVER readable in IndexedDB when encrypted mode is enabled.
 * Used by the security test to prove sensitive data is not stored in the clear.
 */
export const SENSITIVE_SHOP_FIELDS = [
  'name',
  'address',
  'latitude',
  'longitude',
  'primaryOwnerName',
  'primaryOwnerPhone',
  'contacts',
  'notes',
  'tags',
  'imageDataUrl',
] as const

export const SENSITIVE_VISIT_FIELDS = ['note', 'purpose', 'amountSpent'] as const
