/**
 * Shop service - the only place that reads and writes shop records.
 *
 * All reads return fully decrypted domain objects. When the installation is in
 * encrypted mode and the session is locked, reads throw a `LockedError` so the
 * UI can present the unlock screen instead of silently showing nothing.
 */
import { db, openDatabase } from '@/database/db'
import type { Shop, ShopContact, ShopRecord } from '@/types'
import { createId, haversineMeters, nowIso } from '@/utils/format'
import { decodeShop, encodeShop, type CodecContext } from './codec'
import { getSessionKey, hasSessionKey } from './encryptionService'
import { getEncryptionMeta } from './settingsService'
import { queueMany, queueSync } from './syncQueueService'

export class LockedError extends Error {
  constructor() {
    super('The application is locked. Enter your master password to continue.')
    this.name = 'LockedError'
  }
}

/**
 * Build the codec context for the current session.
 * Throws when encryption is enabled but no key is available.
 */
export async function currentCodec(): Promise<CodecContext> {
  const meta = await getEncryptionMeta()
  if (meta.mode === 'encrypted') {
    const key = getSessionKey()
    if (!key) throw new LockedError()
    return { key }
  }
  return { key: null }
}

/** True when a read can be performed right now. */
export async function canRead(): Promise<boolean> {
  const meta = await getEncryptionMeta()
  if (meta.mode !== 'encrypted') return true
  return hasSessionKey()
}

/* ------------------------------------------------------------------ */
/* Reads                                                              */
/* ------------------------------------------------------------------ */

export async function listShops(): Promise<Shop[]> {
  await openDatabase()
  const ctx = await currentCodec()
  const records = await db.shops.toArray()

  const shops: Shop[] = []
  const failed: string[] = []

  for (const record of records) {
    try {
      shops.push(await decodeShop(record, ctx))
    } catch (error) {
      // A single unreadable record must never take down the whole list.
      failed.push(record.id)
      console.error('Failed to decode shop record', record.id, error)
    }
  }

  if (failed.length) {
    console.warn(`${failed.length} shop record(s) could not be decrypted and were skipped.`)
  }

  return shops
}

export async function getShop(id: string): Promise<Shop | null> {
  await openDatabase()
  const ctx = await currentCodec()
  const record = await db.shops.get(id)
  if (!record) return null
  return decodeShop(record, ctx)
}

/** Count without decrypting - safe even while locked. */
export async function countShops(): Promise<number> {
  await openDatabase()
  return db.shops.count()
}

/* ------------------------------------------------------------------ */
/* Writes                                                             */
/* ------------------------------------------------------------------ */

export interface ShopInput {
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
  imageDataUrl?: string | null
}

function cleanContacts(contacts: ShopContact[]): ShopContact[] {
  return (contacts ?? [])
    .filter((c) => (c.name ?? '').trim() || (c.phone ?? '').trim())
    .map((c) => ({
      id: c.id || createId('contact'),
      name: (c.name ?? '').trim(),
      phone: (c.phone ?? '').trim(),
      role: c.role,
      notes: (c.notes ?? '').trim() || undefined,
    }))
}

export async function createShop(input: ShopInput): Promise<Shop> {
  await openDatabase()
  const ctx = await currentCodec()
  const timestamp = nowIso()

  const shop: Shop = {
    id: createId('shop'),
    name: input.name.trim(),
    category: (input.category ?? '').trim(),
    address: (input.address ?? '').trim(),
    latitude: input.latitude,
    longitude: input.longitude,
    primaryOwnerName: (input.primaryOwnerName ?? '').trim(),
    primaryOwnerPhone: (input.primaryOwnerPhone ?? '').trim(),
    contacts: cleanContacts(input.contacts),
    notes: (input.notes ?? '').trim(),
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
    imageDataUrl: input.imageDataUrl ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastVisitedAt: null,
    visitCount: 0,
  }

  const record = await encodeShop(shop, ctx)
  await db.transaction('rw', db.shops, db.syncQueue, async () => {
    await db.shops.add(record)
    await queueSync('shop', shop.id)
  })
  return shop
}

/** Update a shop. `lastVisitedAt` / `visitCount` are owned by visitService. */
export async function updateShop(id: string, input: ShopInput): Promise<Shop> {
  await openDatabase()
  const ctx = await currentCodec()
  const record = await db.shops.get(id)
  if (!record) throw new Error('This shop no longer exists.')

  const existing = await decodeShop(record, ctx)

  const shop: Shop = {
    ...existing,
    name: input.name.trim(),
    category: (input.category ?? '').trim(),
    address: (input.address ?? '').trim(),
    latitude: input.latitude,
    longitude: input.longitude,
    primaryOwnerName: (input.primaryOwnerName ?? '').trim(),
    primaryOwnerPhone: (input.primaryOwnerPhone ?? '').trim(),
    contacts: cleanContacts(input.contacts),
    notes: (input.notes ?? '').trim(),
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
    imageDataUrl: input.imageDataUrl ?? null,
    updatedAt: nowIso(),
  }

  const nextRecord = await encodeShop(shop, ctx)
  await db.transaction('rw', db.shops, db.syncQueue, async () => {
    await db.shops.put(nextRecord)
    await queueSync('shop', shop.id)
  })
  return shop
}

/**
 * Delete a shop. `deleteVisits` mirrors the choice the user made in the
 * confirmation dialog, so behaviour always matches what was explained.
 */
export async function deleteShop(id: string, deleteVisits: boolean): Promise<void> {
  await openDatabase()
  await db.transaction('rw', db.shops, db.visits, db.syncQueue, async () => {
    const visits = deleteVisits ? await db.visits.where('shopId').equals(id).toArray() : []
    if (deleteVisits) {
      await queueMany(visits.map((visit) => ({ entity: 'visit' as const, recordId: visit.id, operation: 'delete' as const })))
    }
    await queueSync('shop', id, 'delete')
    if (deleteVisits) {
      await db.visits.where('shopId').equals(id).delete()
    }
    await db.shops.delete(id)
  })
}

/** Overwrite many shops in one transaction (used by restore and mode switching). */
export async function putShops(shops: Shop[], ctx?: CodecContext): Promise<void> {
  await openDatabase()
  const context = ctx ?? (await currentCodec())
  const records: ShopRecord[] = []
  for (const shop of shops) records.push(await encodeShop(shop, context))
  await db.shops.bulkPut(records)
  await queueMany(shops.map((shop) => ({ entity: 'shop' as const, recordId: shop.id })))
}

/**
 * Re-encode every shop with a different codec (used when encryption is turned
 * on or off). Runs inside a single transaction so a failure rolls back.
 */
export async function reencodeShops(
  shops: Shop[],
  target: CodecContext,
  replace = true,
): Promise<void> {
  await openDatabase()
  const records: ShopRecord[] = []
  for (const shop of shops) records.push(await encodeShop(shop, target))

  await db.transaction('rw', db.shops, async () => {
    if (replace) await db.shops.clear()
    await db.shops.bulkPut(records)
  })
}

/* ------------------------------------------------------------------ */
/* Derived helpers                                                    */
/* ------------------------------------------------------------------ */

/** Case-insensitive search across every user-visible text field. */
export function matchesQuery(shop: Shop, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    shop.name,
    shop.address,
    shop.category,
    shop.primaryOwnerName,
    shop.primaryOwnerPhone,
    shop.notes,
    ...(shop.tags ?? []),
    ...(shop.contacts ?? []).flatMap((c) => [c.name, c.phone, c.role ?? '', c.notes ?? '']),
  ]
    .join('\n')
    .toLowerCase()
  // Every whitespace separated term must appear somewhere.
  return q.split(/\s+/).every((term) => haystack.includes(term))
}

export function searchShops(shops: Shop[], query: string): Shop[] {
  if (!query.trim()) return shops
  return shops.filter((shop) => matchesQuery(shop, query))
}

/**
 * Possible duplicate detection: same-ish name, same phone digits, or very close
 * coordinates. The user is warned and must confirm - records are never merged
 * automatically.
 */
export function findPossibleDuplicates(
  shops: Shop[],
  candidate: { name: string; primaryOwnerPhone: string; latitude: number; longitude: number },
  options: { proximityMeters?: number; excludeId?: string } = {},
): Array<{ shop: Shop; reason: string; distanceMeters?: number }> {
  const proximity = options.proximityMeters ?? 150
  const normalise = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '')
      .trim()
  const targetName = normalise(candidate.name)
  const targetPhone = (candidate.primaryOwnerPhone ?? '').replace(/\D/g, '')

  const out: Array<{ shop: Shop; reason: string; distanceMeters?: number }> = []

  for (const shop of shops) {
    if (options.excludeId && shop.id === options.excludeId) continue

    const shopName = normalise(shop.name)
    const shopPhone = (shop.primaryOwnerPhone ?? '').replace(/\D/g, '')

    if (targetPhone && shopPhone && targetPhone === shopPhone) {
      out.push({ shop, reason: 'Same primary owner phone number' })
      continue
    }

    if (targetName && shopName && (shopName === targetName || shopName.includes(targetName) || targetName.includes(shopName))) {
      out.push({ shop, reason: 'Very similar shop name' })
      continue
    }

    const distance = haversineMeters(
      { latitude: candidate.latitude, longitude: candidate.longitude },
      { latitude: shop.latitude, longitude: shop.longitude },
    )
    if (distance <= proximity) {
      out.push({ shop, reason: `Only ${Math.round(distance)} m from an existing shop`, distanceMeters: distance })
    }
  }

  return out.slice(0, 5)
}

/** All distinct tags across shops, alphabetically. */
export function allTags(shops: Shop[]): string[] {
  const set = new Set<string>()
  for (const shop of shops) for (const tag of shop.tags ?? []) set.add(tag)
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

/** All distinct categories across shops, alphabetically. */
export function allCategories(shops: Shop[]): string[] {
  const set = new Set<string>()
  for (const shop of shops) if (shop.category) set.add(shop.category)
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}
