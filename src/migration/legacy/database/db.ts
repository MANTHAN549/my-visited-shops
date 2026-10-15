/**
 * Dexie / IndexedDB instance.
 *
 * The database is opened lazily on first use. `assertSchemaCompatible` protects
 * against a database created by a newer build of the app.
 */
import Dexie from 'dexie'
import type { Table } from 'dexie'
import { DB_NAME } from './schema'
import type { KeyValueRecord, ShopRecord, SyncQueueRecord, SyncStateRecord, VisitRecord } from '../types'
import { registerMigrations } from './migrations'

export class AppDatabase extends Dexie {
  shops!: Table<ShopRecord, string>
  visits!: Table<VisitRecord, string>
  meta!: Table<KeyValueRecord, string>
  syncQueue!: Table<SyncQueueRecord, string>
  syncState!: Table<SyncStateRecord, string>

  constructor() {
    super(DB_NAME)
    registerMigrations(this)
  }
}

export const db = new AppDatabase()

let openPromise: Promise<Dexie> | null = null

/** Open the database once, reusing the in-flight promise. */
export function openDatabase(): Promise<Dexie> {
  if (!openPromise) {
    openPromise = db.open().catch((error) => {
      openPromise = null
      throw error
    })
  }
  return openPromise
}

export async function closeDatabase(): Promise<void> {
  openPromise = null
  db.close()
}

/**
 * Delete the whole local database. Only ever called from the explicit
 * "Erase all local data" action, after a typed confirmation.
 */
export async function destroyDatabase(): Promise<void> {
  openPromise = null
  await db.delete()
  await db.open()
}

/** Estimate how much of the browser's storage quota is in use. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    return { usage, quota }
  } catch {
    return null
  }
}

/** Ask the browser to keep this origin's data (best effort, may be ignored). */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export { Dexie }
