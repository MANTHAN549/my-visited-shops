import { db, openDatabase } from '@/database/db'
import type { SyncQueueRecord } from '@/types'

/** Queue one record update locally; repeated edits collapse into the same slot. */
export async function queueSync(
  entity: SyncQueueRecord['entity'],
  recordId: string,
  operation: SyncQueueRecord['operation'] = 'upsert',
): Promise<void> {
  await openDatabase()
  const id = `${entity}:${recordId}`
  await db.syncQueue.put({ id, entity, recordId, operation, queuedAt: new Date().toISOString() })
  if (typeof window !== 'undefined') window.setTimeout(() => window.dispatchEvent(new Event('cloud-sync-queued')), 0)
}

export async function queueMany(
  entities: Array<{ entity: SyncQueueRecord['entity']; recordId: string; operation?: SyncQueueRecord['operation'] }>,
): Promise<void> {
  await openDatabase()
  const now = new Date().toISOString()
  await db.syncQueue.bulkPut(entities.map(({ entity, recordId, operation = 'upsert' }) => ({
    id: `${entity}:${recordId}`, entity, recordId, operation, queuedAt: now,
  })))
  if (entities.length && typeof window !== 'undefined') window.setTimeout(() => window.dispatchEvent(new Event('cloud-sync-queued')), 0)
}
