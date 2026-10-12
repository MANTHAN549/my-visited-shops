/**
 * Visit service - owns visit records and keeps the denormalised
 * `lastVisitedAt` / `visitCount` fields on the shop in sync.
 *
 * Visits are stored as separate records linked by `shopId`. The shop's permanent
 * information is never overwritten by a visit, and older visit messages are never
 * replaced when the same shop is visited again.
 */
import { db, openDatabase } from '@/database/db'
import type { Visit, VisitRecord, VisitWithShop } from '@/types'
import { createId, nowIso, toDateKey } from '@/utils/format'
import { decodeShop, decodeVisit, encodeShop, encodeVisit, type CodecContext } from './codec'
import { currentCodec, LockedError } from './shopService'
import { queueSync } from './syncQueueService'

export { LockedError }

/* ------------------------------------------------------------------ */
/* Reads                                                              */
/* ------------------------------------------------------------------ */

export async function listVisits(): Promise<Visit[]> {
  await openDatabase()
  const ctx = await currentCodec()
  const records = await db.visits.orderBy('visitedAt').reverse().toArray()

  const visits: Visit[] = []
  for (const record of records) {
    try {
      visits.push(await decodeVisit(record, ctx))
    } catch (error) {
      console.error('Failed to decode visit record', record.id, error)
    }
  }
  return visits
}

export async function getVisit(id: string): Promise<Visit | null> {
  await openDatabase()
  const ctx = await currentCodec()
  const record = await db.visits.get(id)
  if (!record) return null
  return decodeVisit(record, ctx)
}

export async function listVisitsForShop(shopId: string): Promise<Visit[]> {
  await openDatabase()
  const ctx = await currentCodec()
  const records = await db.visits.where('shopId').equals(shopId).toArray()
  const visits: Visit[] = []
  for (const record of records) {
    try {
      visits.push(await decodeVisit(record, ctx))
    } catch (error) {
      console.error('Failed to decode visit record', record.id, error)
    }
  }
  return visits.sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))
}

/** Visits joined with their shop, for the visit history page. */
export async function listVisitsWithShops(): Promise<VisitWithShop[]> {
  const [visits, shopRecords, ctx] = await Promise.all([
    listVisits(),
    (async () => {
      await openDatabase()
      return db.shops.toArray()
    })(),
    currentCodec(),
  ])

  const shopMap = new Map<string, VisitWithShop['shop']>()
  for (const record of shopRecords) {
    try {
      shopMap.set(record.id, await decodeShop(record, ctx))
    } catch {
      shopMap.set(record.id, null)
    }
  }

  return visits.map((visit) => ({ ...visit, shop: shopMap.get(visit.shopId) ?? null }))
}

export async function countVisits(): Promise<number> {
  await openDatabase()
  return db.visits.count()
}

/* ------------------------------------------------------------------ */
/* Writes                                                             */
/* ------------------------------------------------------------------ */

export interface VisitInput {
  shopId: string
  visitedAt: string
  note: string
  purpose: string
  amountSpent: string
}

/**
 * Create a visit record and update the shop's rollup fields.
 *
 * Both writes happen in one IndexedDB transaction so the count can never drift
 * away from the number of stored visit rows.
 */
export async function createVisit(input: VisitInput): Promise<Visit> {
  await openDatabase()
  const ctx = await currentCodec()
  const timestamp = nowIso()

  const visit: Visit = {
    id: createId('visit'),
    shopId: input.shopId,
    visitedAt: input.visitedAt || timestamp,
    note: input.note.trim(),
    purpose: (input.purpose ?? '').trim(),
    amountSpent: (input.amountSpent ?? '').trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  const visitRecord = await encodeVisit(visit, ctx)

  const shopRecord = await db.shops.get(input.shopId)
  if (!shopRecord) throw new Error('The shop for this visit no longer exists.')
  const shop = await decodeShop(shopRecord, ctx)

  const isLatest = !shop.lastVisitedAt || visit.visitedAt > shop.lastVisitedAt
  const updatedShop = {
    ...shop,
    lastVisitedAt: isLatest ? visit.visitedAt : shop.lastVisitedAt,
    visitCount: (shop.visitCount ?? 0) + 1,
    updatedAt: timestamp,
  }
  const updatedShopRecord = await encodeShop(updatedShop, ctx)

  await db.transaction('rw', db.shops, db.visits, db.syncQueue, async () => {
    await db.visits.add(visitRecord)
    await db.shops.put(updatedShopRecord)
    await queueSync('visit', visit.id)
    await queueSync('shop', shop.id)
  })

  return visit
}

/** Edit a visit note / purpose / amount. Does not change the shop rollups. */
export async function updateVisit(
  id: string,
  patch: Partial<Pick<Visit, 'note' | 'purpose' | 'amountSpent' | 'visitedAt'>>,
): Promise<Visit> {
  await openDatabase()
  const ctx = await currentCodec()
  const record = await db.visits.get(id)
  if (!record) throw new Error('This visit record no longer exists.')

  const existing = await decodeVisit(record, ctx)
  const next: Visit = {
    ...existing,
    note: patch.note !== undefined ? patch.note.trim() : existing.note,
    purpose: patch.purpose !== undefined ? patch.purpose.trim() : existing.purpose,
    amountSpent: patch.amountSpent !== undefined ? patch.amountSpent.trim() : existing.amountSpent,
    visitedAt: patch.visitedAt ?? existing.visitedAt,
    updatedAt: nowIso(),
  }

  await db.transaction('rw', db.visits, db.syncQueue, async () => {
    await db.visits.put(await encodeVisit(next, ctx))
    await queueSync('visit', next.id)
  })

  // If the visit date changed, the shop's lastVisitedAt may need to move.
  if (patch.visitedAt && patch.visitedAt !== existing.visitedAt) {
    await recomputeShopRollup(existing.shopId, ctx)
  }

  return next
}

export async function deleteVisit(id: string): Promise<void> {
  await openDatabase()
  const ctx = await currentCodec()
  const record = await db.visits.get(id)
  if (!record) return

  await db.transaction('rw', db.visits, db.syncQueue, async () => {
    await db.visits.delete(id)
    await queueSync('visit', id, 'delete')
  })
  await recomputeShopRollup(record.shopId, ctx)
}

export async function deleteVisitsForShop(shopId: string): Promise<number> {
  await openDatabase()
  return db.visits.where('shopId').equals(shopId).delete()
}

/**
 * Recalculate `lastVisitedAt` and `visitCount` from the actual visit rows.
 * Used after edits and deletes so the rollups always match reality.
 */
export async function recomputeShopRollup(shopId: string, ctx?: CodecContext): Promise<void> {
  await openDatabase()
  const context = ctx ?? (await currentCodec())

  const records = await db.visits.where('shopId').equals(shopId).toArray()
  let count = 0
  let latest: string | null = null

  for (const record of records) {
    count += 1
    if (!latest || record.visitedAt > latest) latest = record.visitedAt
  }

  const shopRecord = await db.shops.get(shopId)
  if (!shopRecord) return
  const shop = await decodeShop(shopRecord, context)

  await db.shops.put(
    await encodeShop(
      { ...shop, visitCount: count, lastVisitedAt: latest, updatedAt: nowIso() },
      context,
    ),
  )
}

/** Recompute rollups for every shop (used after a restore). */
export async function recomputeAllRollups(): Promise<void> {
  await openDatabase()
  const ids = (await db.shops.toArray()).map((r) => r.id)
  for (const id of ids) await recomputeShopRollup(id)
}

/** Replace all visits in one transaction (restore). */
export async function putVisits(visits: Visit[], ctx?: CodecContext): Promise<void> {
  await openDatabase()
  const context = ctx ?? (await currentCodec())
  const records: VisitRecord[] = []
  for (const visit of visits) records.push(await encodeVisit(visit, context))
  await db.visits.bulkPut(records)
}

export async function reencodeVisits(
  visits: Visit[],
  target: CodecContext,
  replace = true,
): Promise<void> {
  await openDatabase()
  const records: VisitRecord[] = []
  for (const visit of visits) records.push(await encodeVisit(visit, target))
  await db.transaction('rw', db.visits, async () => {
    if (replace) await db.visits.clear()
    await db.visits.bulkPut(records)
  })
}

/* ------------------------------------------------------------------ */
/* Filtering / grouping (in memory, because notes are encrypted)      */
/* ------------------------------------------------------------------ */

export interface VisitFilters {
  query: string
  shopId: string
  from: string
  to: string
}

export function filterVisits(visits: VisitWithShop[], filters: VisitFilters): VisitWithShop[] {
  const q = filters.query.trim().toLowerCase()
  const terms = q ? q.split(/\s+/) : []
  const fromTs = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : null
  const toTs = filters.to ? new Date(`${filters.to}T23:59:59.999`).getTime() : null

  return visits.filter((visit) => {
    if (filters.shopId && visit.shopId !== filters.shopId) return false

    const ts = new Date(visit.visitedAt).getTime()
    if (fromTs !== null && ts < fromTs) return false
    if (toTs !== null && ts > toTs) return false

    if (terms.length) {
      const haystack = [
        visit.shop?.name ?? '',
        visit.shop?.address ?? '',
        visit.note,
        visit.purpose,
        visit.amountSpent,
      ]
        .join('\n')
        .toLowerCase()
      if (!terms.every((term) => haystack.includes(term))) return false
    }

    return true
  })
}

export function sortVisits(
  visits: VisitWithShop[],
  direction: 'newest' | 'oldest',
): VisitWithShop[] {
  const sorted = [...visits].sort((a, b) => a.visitedAt.localeCompare(b.visitedAt))
  return direction === 'newest' ? sorted.reverse() : sorted
}

/** Group visits by calendar day (local time), preserving the incoming order. */
export function groupVisitsByDate(visits: VisitWithShop[]): Array<{ date: string; visits: VisitWithShop[] }> {
  const groups = new Map<string, VisitWithShop[]>()
  for (const visit of visits) {
    const key = toDateKey(visit.visitedAt)
    const bucket = groups.get(key)
    if (bucket) bucket.push(visit)
    else groups.set(key, [visit])
  }
  return Array.from(groups.entries()).map(([date, items]) => ({ date, visits: items }))
}

/** Group visits by shop, newest visit first inside each group. */
export function groupVisitsByShop(visits: VisitWithShop[]): Array<{
  shopId: string
  shopName: string
  visits: VisitWithShop[]
}> {
  const groups = new Map<string, VisitWithShop[]>()
  for (const visit of visits) {
    const bucket = groups.get(visit.shopId)
    if (bucket) bucket.push(visit)
    else groups.set(visit.shopId, [visit])
  }
  return Array.from(groups.entries())
    .map(([shopId, items]) => ({
      shopId,
      shopName: items[0]?.shop?.name ?? 'Unknown shop',
      visits: [...items].sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)),
    }))
    .sort((a, b) => a.shopName.localeCompare(b.shopName))
}

/** Sum of `amountSpent` across visits (only for reporting). */
export function totalSpent(visits: Visit[]): number {
  return visits.reduce((sum, visit) => {
    const value = Number(String(visit.amountSpent ?? '').replace(/[^\d.-]/g, ''))
    return Number.isFinite(value) ? sum + value : sum
  }, 0)
}
