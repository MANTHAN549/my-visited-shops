/**
 * Database migrations.
 *
 * Dexie runs each `.version()` block in order. Version 1 creates the three
 * stores; later versions must be appended here rather than edited in place, so
 * that an existing installation on a user's phone upgrades safely.
 *
 * Rules for future migrations:
 *   1. Never renumber or delete an existing version block.
 *   2. Add a new `.version(n)` with the *complete* store definitions for that
 *      version (Dexie requires the full set, not a delta).
 *   3. Do data reshaping inside `.upgrade(async (tx) => ...)`, ideally inside a
 *      single transaction so a failure leaves the database untouched.
 */
import type Dexie from 'dexie'
import { DB_VERSION, META_KEYS, STORES } from './schema'

export function registerMigrations(db: Dexie): void {
  // Preserve the v1 shape on installed devices and add sync metadata in v2.
  const { syncQueue: _queue, syncState: _state, ...versionOneStores } = STORES
  void _queue
  void _state
  db.version(1).stores(versionOneStores)
  db.version(2).stores({ ...STORES })

  db.on('populate', () => {
    void db.table('meta').put({
      key: META_KEYS.schemaInfo,
      value: { version: DB_VERSION, createdAt: new Date().toISOString() },
      updatedAt: new Date().toISOString(),
    })
  })
}

/**
 * Guard used before writing: refuses to run when the on-disk database is newer
 * than the running code, which would silently corrupt newer fields.
 */
export async function assertSchemaCompatible(db: Dexie): Promise<void> {
  const open = db.isOpen() ? db : await db.open()
  const version = open.verno
  if (version > DB_VERSION) {
    throw new Error(
      `This device's database (v${version}) was created by a newer version of My Visited Shops. ` +
        `Please update the application before continuing so no data is lost.`,
    )
  }
}
