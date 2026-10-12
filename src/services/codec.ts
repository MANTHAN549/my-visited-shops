/**
 * Record codec: converts between the rich domain objects used by the UI and the
 * encrypted envelope rows that are actually written to IndexedDB.
 *
 * When the installation is in "encrypted" mode a CryptoKey must be supplied;
 * when it is in "plain local storage" mode (`enc: 0`) the payload is stored as
 * JSON so the app still works for users who decline encryption.
 */
import type {
  KeyValueRecord,
  Shop,
  ShopRecord,
  Visit,
  VisitRecord,
} from '@/types'
import { ENCRYPTION_ENVELOPE_VERSION } from '@/types'
import { decryptJson, encryptJson } from './encryptionService'

export interface CodecContext {
  /** null => plain JSON storage (encryption disabled). */
  key: CryptoKey | null
}

/* ------------------------------------------------------------------ */
/* Shops                                                              */
/* ------------------------------------------------------------------ */

/** Build the envelope row for a shop. */
export async function encodeShop(shop: Shop, ctx: CodecContext): Promise<ShopRecord> {
  const base = {
    id: shop.id,
    createdAt: shop.createdAt,
    updatedAt: shop.updatedAt,
    lastVisitedAt: shop.lastVisitedAt ?? null,
    visitCount: shop.visitCount ?? 0,
    v: ENCRYPTION_ENVELOPE_VERSION,
  }

  if (!ctx.key) {
    return { ...base, enc: 0, data: JSON.stringify(shop) }
  }

  const { ciphertext, iv } = await encryptJson(ctx.key, shop)
  return { ...base, enc: 1, data: ciphertext, iv }
}

/** Read a shop envelope back into a domain object. */
export async function decodeShop(record: ShopRecord, ctx: CodecContext): Promise<Shop> {
  if (record.enc === 0) {
    return normaliseShop(JSON.parse(record.data) as Partial<Shop>, record)
  }
  if (!ctx.key) {
    throw new Error('This record is encrypted. Unlock the application to read it.')
  }
  const plain = await decryptJson<Partial<Shop>>(ctx.key, record.iv ?? '', record.data)
  return normaliseShop(plain, record)
}

/** Fill in defaults so records written by an older build never crash the UI. */
function normaliseShop(plain: Partial<Shop>, record: ShopRecord): Shop {
  return {
    id: plain.id ?? record.id,
    name: plain.name ?? 'Untitled shop',
    category: plain.category ?? '',
    address: plain.address ?? '',
    latitude: typeof plain.latitude === 'number' ? plain.latitude : 0,
    longitude: typeof plain.longitude === 'number' ? plain.longitude : 0,
    primaryOwnerName: plain.primaryOwnerName ?? '',
    primaryOwnerPhone: plain.primaryOwnerPhone ?? '',
    contacts: Array.isArray(plain.contacts) ? plain.contacts : [],
    notes: plain.notes ?? '',
    tags: Array.isArray(plain.tags) ? plain.tags : [],
    imageDataUrl: plain.imageDataUrl ?? null,
    createdAt: plain.createdAt ?? record.createdAt,
    updatedAt: plain.updatedAt ?? record.updatedAt,
    lastVisitedAt: plain.lastVisitedAt ?? record.lastVisitedAt ?? null,
    visitCount: typeof plain.visitCount === 'number' ? plain.visitCount : (record.visitCount ?? 0),
  }
}

/* ------------------------------------------------------------------ */
/* Visits                                                             */
/* ------------------------------------------------------------------ */

export async function encodeVisit(visit: Visit, ctx: CodecContext): Promise<VisitRecord> {
  const base = {
    id: visit.id,
    shopId: visit.shopId,
    visitedAt: visit.visitedAt,
    createdAt: visit.createdAt,
    updatedAt: visit.updatedAt,
    v: ENCRYPTION_ENVELOPE_VERSION,
  }

  if (!ctx.key) {
    return { ...base, enc: 0, data: JSON.stringify(visit) }
  }

  const { ciphertext, iv } = await encryptJson(ctx.key, visit)
  return { ...base, enc: 1, data: ciphertext, iv }
}

export async function decodeVisit(record: VisitRecord, ctx: CodecContext): Promise<Visit> {
  if (record.enc === 0) {
    return normaliseVisit(JSON.parse(record.data) as Partial<Visit>, record)
  }
  if (!ctx.key) {
    throw new Error('This visit record is encrypted. Unlock the application to read it.')
  }
  const plain = await decryptJson<Partial<Visit>>(ctx.key, record.iv ?? '', record.data)
  return normaliseVisit(plain, record)
}

function normaliseVisit(plain: Partial<Visit>, record: VisitRecord): Visit {
  return {
    id: plain.id ?? record.id,
    shopId: plain.shopId ?? record.shopId,
    visitedAt: plain.visitedAt ?? record.visitedAt,
    note: plain.note ?? '',
    purpose: plain.purpose ?? '',
    amountSpent: plain.amountSpent ?? '',
    createdAt: plain.createdAt ?? record.createdAt,
    updatedAt: plain.updatedAt ?? record.updatedAt,
  }
}

/* ------------------------------------------------------------------ */
/* Meta / settings                                                     */
/* ------------------------------------------------------------------ */

export function makeMetaRecord(key: string, value: unknown): KeyValueRecord {
  return { key, value, updatedAt: new Date().toISOString() }
}
