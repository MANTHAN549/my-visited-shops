import { db, openDatabase } from '@/database/db'
import type { CloudRecord, Shop, SyncQueueRecord, SyncStateRecord, Visit } from '@/types'
import { supabase } from './supabaseClient'
import { decryptCloudJson, encryptCloudJson } from './cloudEncryptionService'
import { listShops, putShops } from './shopService'
import { listVisits, putVisits, recomputeAllRollups } from './visitService'
import { queueSync } from './syncQueueService'

export interface SyncConflict {
  id: string
  entity: 'shop' | 'visit'
  recordId: string
  reason: string
  cloud: CloudRecord
}

export interface SyncSummary { uploaded: number; downloaded: number; conflicts: SyncConflict[] }
const stateId = (entity: string, id: string) => `${entity}:${id}`

function requiredClient() {
  if (!supabase) throw new Error('Cloud sync is not configured. Set the Supabase environment values and restart the app.')
  return supabase
}

async function rowsForUser(userId: string): Promise<CloudRecord[]> {
  const { data, error } = await requiredClient().from('encrypted_records').select('*').eq('user_id', userId)
  if (error) throw new Error(`Could not download cloud records: ${error.message}`)
  return (data ?? []) as CloudRecord[]
}

async function writeCloud(
  userId: string,
  entity: SyncQueueRecord['entity'],
  recordId: string,
  operation: SyncQueueRecord['operation'],
  expectedRevision: number,
  value?: Shop | Visit,
): Promise<CloudRecord> {
  const client = requiredClient()
  const revision = expectedRevision + 1
  const payload = operation === 'upsert' ? await encryptCloudJson(value) : { ciphertext: null, iv: null }
  const now = new Date().toISOString()
  const body = {
    user_id: userId, entity, id: recordId, revision, ciphertext: payload.ciphertext,
    iv: payload.iv, updated_at: now, deleted_at: operation === 'delete' ? now : null,
  }

  if (expectedRevision === 0) {
    const { data, error } = await client.from('encrypted_records').insert(body).select('*').single()
    if (error) throw new Error(`Cloud record changed or could not be created: ${error.message}`)
    return data as CloudRecord
  }
  const { data, error } = await client.from('encrypted_records').update(body)
    .eq('user_id', userId).eq('entity', entity).eq('id', recordId).eq('revision', expectedRevision)
    .select('*').maybeSingle()
  if (error) throw new Error(`Could not update cloud record: ${error.message}`)
  if (!data) throw new Error('This record changed on another device during synchronization. Retry to review the conflict.')
  return data as CloudRecord
}

async function remember(row: CloudRecord, updatedAt = row.updated_at): Promise<void> {
  const id = stateId(row.entity, row.id)
  await db.syncState.put({ id, entity: row.entity, recordId: row.id, revision: row.revision, updatedAt } satisfies SyncStateRecord)
  await db.syncQueue.delete(id)
}

async function saveLocal(row: CloudRecord): Promise<void> {
  if (row.deleted_at) {
    if (row.entity === 'shop') await db.shops.delete(row.id)
    else await db.visits.delete(row.id)
    return
  }
  if (!row.ciphertext || !row.iv) throw new Error('A cloud record is missing its encrypted payload.')
  if (row.entity === 'shop') await putShops([await decryptCloudJson<Shop>(row.ciphertext, row.iv)])
  else await putVisits([await decryptCloudJson<Visit>(row.ciphertext, row.iv)])
}

/** Local-first sync. Updates are optimistic on revision and conflicts remain queued. */
export async function synchronize(userId: string): Promise<SyncSummary> {
  if (!navigator.onLine) throw new Error('You are offline. Local records remain available and will sync after reconnecting.')
  await openDatabase()
  const [shops, visits, remote, queued] = await Promise.all([
    listShops(), listVisits(), rowsForUser(userId), db.syncQueue.toArray(),
  ])
  const localShops = new Map(shops.map((item) => [item.id, item]))
  const localVisits = new Map(visits.map((item) => [item.id, item]))
  const remoteById = new Map(remote.map((row) => [stateId(row.entity, row.id), row]))
  const queueById = new Map(queued.map((item) => [item.id, item]))
  const conflicts: SyncConflict[] = []
  let uploaded = 0
  let downloaded = 0

  // Push the local outbox first with compare-and-swap revisions.
  for (const item of queued) {
    const existing = remoteById.get(item.id)
    const state = await db.syncState.get(item.id)
    const local = item.entity === 'shop' ? localShops.get(item.recordId) : localVisits.get(item.recordId)
    const expected = state?.revision ?? 0
    if (existing && (!state || existing.revision !== expected)) {
      conflicts.push({ id: item.id, entity: item.entity, recordId: item.recordId, reason: 'Both this device and cloud have changed since the last sync.', cloud: existing })
      continue
    }
    if (item.operation === 'upsert' && !local) continue
    try {
      const row = await writeCloud(userId, item.entity, item.recordId, item.operation, expected, local)
      await remember(row, local?.updatedAt ?? row.updated_at)
      remoteById.set(item.id, row)
      uploaded += 1
    } catch (err) {
      const latest = (await rowsForUser(userId)).find((row) => stateId(row.entity, row.id) === item.id)
      if (latest && latest.revision !== expected) {
        conflicts.push({ id: item.id, entity: item.entity, recordId: item.recordId, reason: 'A newer cloud revision was found while uploading.', cloud: latest })
      } else throw err
    }
  }

  // Import remote changes only when this device has no competing local edit.
  const currentShops = new Map((await listShops()).map((item) => [item.id, item]))
  const currentVisits = new Map((await listVisits()).map((item) => [item.id, item]))
  for (const row of remoteById.values()) {
    const id = stateId(row.entity, row.id)
    if (conflicts.some((conflict) => conflict.id === id)) continue
    const state = await db.syncState.get(id)
    const pending = queueById.has(id)
    const local = row.entity === 'shop' ? currentShops.get(row.id) : currentVisits.get(row.id)
    if (pending) continue
    if (!state && local) {
      // Existing local data is never silently replaced on first account link.
      conflicts.push({ id, entity: row.entity, recordId: row.id, reason: 'A local record and a cloud record share an ID but have no shared sync history.', cloud: row })
      continue
    }
    if (state && row.revision <= state.revision) continue
    if (local && state && local.updatedAt > state.updatedAt) {
      conflicts.push({ id, entity: row.entity, recordId: row.id, reason: 'This device has an unqueued local edit newer than its last sync.', cloud: row })
      continue
    }
    await saveLocal(row)
    await remember(row)
    downloaded += row.deleted_at ? 0 : 1
  }

  await recomputeAllRollups()
  return { uploaded, downloaded, conflicts }
}

/** Explicitly resolve a displayed conflict; no side is overwritten without a user choice. */
export async function resolveConflict(
  userId: string,
  conflict: SyncConflict,
  choice: 'local' | 'cloud',
): Promise<void> {
  const { entity, recordId, cloud } = conflict
  const id = stateId(entity, recordId)
  if (choice === 'cloud') {
    await saveLocal(cloud)
    await remember(cloud)
  } else {
    const local = entity === 'shop'
      ? (await listShops()).find((item) => item.id === recordId)
      : (await listVisits()).find((item) => item.id === recordId)
    const queued = await db.syncQueue.get(id)
    const row = await writeCloud(userId, entity, recordId, queued?.operation ?? (local ? 'upsert' : 'delete'), cloud.revision, local)
    await remember(row, local?.updatedAt ?? row.updated_at)
  }
  await recomputeAllRollups()
}

export async function acknowledgeInitialLocalData(userId: string): Promise<SyncSummary> {
  // Only records with no local cloud revision are treated as first-device data.
  const [shops, visits] = await Promise.all([listShops(), listVisits()])
  for (const shop of shops) if (!(await db.syncState.get(stateId('shop', shop.id)))) await queueSync('shop', shop.id)
  for (const visit of visits) if (!(await db.syncState.get(stateId('visit', visit.id)))) await queueSync('visit', visit.id)
  return synchronize(userId)
}
