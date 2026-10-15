import type { AppSettings, Shop, Visit } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'
import { decryptString, deriveKey, encryptString, randomBytes, bytesToBase64 } from './dataCrypto'
import { encryptedDataDocumentSchema, appDataSchema, persistedSettingsSchema, persistedShopSchema, persistedVisitSchema, tombstoneSchema, type Tombstone } from './persistedSchemas'

const CACHE_KEY = 'local_json_cache'
const ITERATIONS = 600_000
if (typeof localStorage !== 'undefined') {
  for (const key of ['gh_token', 'gh_owner', 'gh_repo', 'gh_branch', 'gh_data_cache']) localStorage.removeItem(key)
}
export type AppData = { shops: Shop[]; visits: Visit[]; settings: AppSettings; deleted: Tombstone[] }
type WireDocument = { version: 2; updatedAt: string; encryption: { kdf: 'PBKDF2-SHA256'; iterations: number; salt: string; iv: string; ciphertext: string } }

let passphrase: string | null = null
let writes: Promise<unknown> = Promise.resolve()

export function setDataPassphrase(value: string | null): void { passphrase = value }
export function hasDataPassphrase(): boolean { return passphrase !== null }
function emptyPayload(): AppData { return { shops: [], visits: [], settings: DEFAULT_SETTINGS, deleted: [] } }
async function compressShopImage(shop: Shop): Promise<Shop> {
  if (!shop.imageDataUrl || typeof document === 'undefined') return shop
  const image = new Image()
  image.src = shop.imageDataUrl
  await image.decode().catch(() => { throw new Error('A shop image could not be compressed. Please choose the image again.') })
  const scale = Math.min(1, 800 / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Your browser could not compress this shop image.')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return { ...shop, imageDataUrl: canvas.toDataURL('image/jpeg', 0.7) }
}
function mergeRecords<T extends { id: string; updatedAt: string }>(left: T[], right: T[]): T[] {
  const merged = new Map(left.map((item) => [item.id, item]))
  for (const item of right) {
    const current = merged.get(item.id)
    if (!current || item.updatedAt >= current.updatedAt) merged.set(item.id, item)
  }
  return [...merged.values()]
}
export function mergeAppData(base: AppData, incoming: AppData): AppData {
  const tombstones = new Map<string, Tombstone>()
  for (const tombstone of [...base.deleted, ...incoming.deleted]) {
    const key = `${tombstone.type}:${tombstone.id}`
    const current = tombstones.get(key)
    if (!current || tombstone.deletedAt > current.deletedAt) tombstones.set(key, tombstone)
  }
  const deleted = [...tombstones.values()]
  const shops = mergeRecords(base.shops, incoming.shops).filter((item) =>
    !deleted.some((t) => t.type === 'shop' && t.id === item.id && t.deletedAt >= item.updatedAt))
  const visits = mergeRecords(base.visits, incoming.visits).filter((item) =>
    !deleted.some((t) => t.type === 'visit' && t.id === item.id && t.deletedAt >= item.updatedAt))
  const visitMap = new Map<string, Visit[]>()
  for (const visit of visits) visitMap.set(visit.shopId, [...(visitMap.get(visit.shopId) ?? []), visit])
  const rolledShops = shops.map((shop) => {
    const related = visitMap.get(shop.id) ?? []
    const latest = related.map((visit) => visit.visitedAt).sort().at(-1) ?? null
    return { ...shop, visitCount: related.length, lastVisitedAt: latest }
  })
  return { shops: rolledShops, visits, settings: incoming.settings, deleted }
}

async function decryptWire(wire: WireDocument): Promise<AppData> {
  if (!passphrase) throw new Error('Enter your data passphrase to unlock your data.')
  const key = await deriveKey(passphrase, wire.encryption.salt, wire.encryption.iterations)
  let parsed: unknown
  try { parsed = JSON.parse(await decryptString(key, wire.encryption.iv, wire.encryption.ciphertext)) }
  catch { throw new Error('Wrong data passphrase, or encrypted data is damaged.') }
  const payload = appDataSchema.safeParse(parsed)
  if (!payload.success) throw new Error('The local data file is invalid. Its records failed validation.')
  return payload.data
}
async function encryptPayload(payload: AppData, salt: string): Promise<WireDocument> {
  if (!passphrase) throw new Error('Enter your data passphrase to unlock your data.')
  const validated = appDataSchema.safeParse(payload)
  if (!validated.success) throw new Error('Changes failed persisted data validation.')
  const key = await deriveKey(passphrase, salt, ITERATIONS)
  const encrypted = await encryptString(key, JSON.stringify(validated.data))
  const wire: WireDocument = { version: 2, updatedAt: new Date().toISOString(), encryption: { kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt, iv: encrypted.iv, ciphertext: encrypted.ciphertext } }
  const size = new Blob([JSON.stringify(wire)]).size
  if (size > 50 * 1024 * 1024) throw new Error('The local database/data.json file would exceed 50 MB. Compress or remove shop images before saving.')
  return wire
}
async function request(init: RequestInit): Promise<Response> {
  try { return await fetch('/api/database', { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } }) }
  catch { throw new Error('Could not reach the local database service. Run the app using npm run dev.') }
}
async function fetchFresh(): Promise<{ payload: AppData; sha: string | null; salt: string }> {
  const response = await request({ method: 'GET', cache: 'no-store' })
  if (!response.ok) throw new Error(`The local database service returned HTTP ${response.status}.`)
  let raw: unknown
  try { raw = await response.json() } catch { throw new Error('The local database service returned invalid JSON.') }
  if (!raw || typeof raw !== 'object' || !('document' in raw) || !('revision' in raw)) throw new Error('The local database service returned an invalid response.')
  const revision = typeof raw.revision === 'string' ? raw.revision : null
  if (raw.document === null) {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 2, payload: emptyPayload() }))
    return { payload: emptyPayload(), sha: null, salt: bytesToBase64(randomBytes(16)) }
  }
  const valid = encryptedDataDocumentSchema.safeParse(raw.document)
  if (!valid.success) throw new Error('The local database/data.json file has an unsupported or invalid format.')
  const wire = valid.data as WireDocument
  const payload = await decryptWire(wire)
  localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 2, wire }))
  return { payload, sha: revision, salt: wire.encryption.salt }
}
export async function refreshLocalData(): Promise<AppData> {
  try { return (await fetchFresh()).payload }
  catch (error) {
    if (error instanceof Error && /offline|could not reach the local database/i.test(error.message)) {
      const cache = localStorage.getItem(CACHE_KEY)
      if (cache) {
        const parsed: unknown = JSON.parse(cache)
        if (parsed && typeof parsed === 'object' && 'wire' in parsed) {
        const cachedDocument = encryptedDataDocumentSchema.safeParse(parsed.wire)
          if (cachedDocument.success) return await decryptWire(cachedDocument.data as WireDocument)
        }
        if (parsed && typeof parsed === 'object' && 'payload' in parsed) localStorage.removeItem(CACHE_KEY)
      }
    }
    throw error
  }
}
export async function mergeAndSaveLocalData(incoming: AppData): Promise<AppData> {
  return enqueue(() => updateFile((current, isNew) => {
    const combined = mergeAppData(current, incoming)
    return {
      ...combined,
      settings: isNew ? incoming.settings : current.settings,
    }
  }))
}
export async function replaceLocalData(incoming: AppData): Promise<AppData> {
  return enqueue(() => updateFile((current) => {
    const keptIds = new Set([...incoming.shops.map((item) => `shop:${item.id}`), ...incoming.visits.map((item) => `visit:${item.id}`)])
    const deleted = [...incoming.deleted, ...current.deleted.filter((item) => !keptIds.has(`${item.type}:${item.id}`)), ...current.shops.filter((item) => !keptIds.has(`shop:${item.id}`)).map((item) => tombstoneSchema.parse({ id: item.id, type: 'shop', deletedAt: new Date().toISOString() })), ...current.visits.filter((item) => !keptIds.has(`visit:${item.id}`)).map((item) => tombstoneSchema.parse({ id: item.id, type: 'visit', deletedAt: new Date().toISOString() }))]
    return mergeAppData(emptyPayload(), { ...incoming, deleted })
  }))
}
export async function testLocalDatabase(): Promise<number> {
  const fresh = await fetchFresh()
  return new Blob([JSON.stringify(await encryptPayload(fresh.payload, fresh.salt))]).size
}
export async function initializeLocalStore(secret: string): Promise<void> {
  if (secret.length < 12) throw new Error('Use a data passphrase with at least 12 characters.')
  setDataPassphrase(secret)
  const fresh = await fetchFresh()
  if (fresh.sha) return
  await enqueue(() => updateFile((current) => current))
}
async function updateFile(change: (current: AppData, isNew: boolean) => AppData): Promise<AppData> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const fresh = await fetchFresh()
    const payload = appDataSchema.parse(change(fresh.payload, fresh.sha === null))
    const wire = await encryptPayload(payload, fresh.salt)
    const response = await request({
      method: 'PUT', cache: 'no-store',
      body: JSON.stringify({ document: wire, expectedRevision: fresh.sha }),
    })
    if (response.ok) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 2, wire }))
      return payload
    }
    lastError = new Error(response.status === 409 ? 'The local data file changed while saving. Please try again.' : `The local database service returned HTTP ${response.status}.`)
    if (response.status !== 409) throw lastError
  }
  throw lastError ?? new Error('Could not save the local database after three conflict retries.')
}
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const task = writes.then(operation, operation)
  writes = task.then(() => undefined, () => undefined)
  return task
}
export async function listShops(): Promise<Shop[]> { return (await refreshLocalData()).shops }
export async function getShop(id: string): Promise<Shop | null> { return (await listShops()).find((shop) => shop.id === id) ?? null }
export async function searchShops(query: string): Promise<Shop[]> {
  const needle = query.trim().toLocaleLowerCase()
  return (await listShops()).filter((shop) => !needle || [shop.name, shop.category, shop.address, shop.notes, shop.primaryOwnerName, shop.primaryOwnerPhone, ...shop.tags].some((field) => field.toLocaleLowerCase().includes(needle)))
}
export function addShop(shop: Shop): Promise<Shop> {
  return enqueue(async () => { const prepared = await compressShopImage(shop); await updateFile((data) => {
    const shops = mergeRecords(data.shops, [persistedShopSchema.parse(prepared)])
    return mergeAppData({ ...data, shops }, emptyPayloadWithRecords(shops, data.visits, data.settings, data.deleted))
  }); return prepared })
}
export function updateShop(shop: Shop): Promise<Shop> { return addShop(shop) }
export function deleteShop(id: string, deleteVisits = true): Promise<void> {
  return enqueue(async () => { await updateFile((data) => {
    const deletedAt = new Date().toISOString()
    const affectedVisits = deleteVisits ? data.visits.filter((visit) => visit.shopId === id) : []
    const next: AppData = { ...data, shops: data.shops.filter((shop) => shop.id !== id), visits: deleteVisits ? data.visits.filter((visit) => visit.shopId !== id) : data.visits, deleted: [
      ...data.deleted, tombstoneSchema.parse({ id, type: 'shop', deletedAt }),
      ...affectedVisits.map((visit) => tombstoneSchema.parse({ id: visit.id, type: 'visit', deletedAt })),
    ] }
    return mergeAppData(next, next)
  }) })
}
export async function listVisits(): Promise<Visit[]> { return (await refreshLocalData()).visits }
export async function getVisit(id: string): Promise<Visit | null> { return (await listVisits()).find((visit) => visit.id === id) ?? null }
export async function searchVisits(query: string): Promise<Visit[]> {
  const needle = query.trim().toLocaleLowerCase()
  return (await listVisits()).filter((visit) => !needle || [visit.note, visit.purpose, visit.amountSpent].some((field) => field.toLocaleLowerCase().includes(needle)))
}
export function addVisit(visit: Visit): Promise<Visit> {
  return enqueue(async () => { await updateFile((data) => {
    const visits = mergeRecords(data.visits, [persistedVisitSchema.parse(visit)])
    return mergeAppData({ ...data, visits }, emptyPayloadWithRecords(data.shops, visits, data.settings, data.deleted))
  }); return visit })
}
export function updateVisit(visit: Visit): Promise<Visit> { return addVisit(visit) }
export function deleteVisit(id: string): Promise<void> {
  return enqueue(async () => { await updateFile((data) => {
    const next: AppData = { ...data, visits: data.visits.filter((visit) => visit.id !== id), deleted: [...data.deleted, tombstoneSchema.parse({ id, type: 'visit', deletedAt: new Date().toISOString() })] }
    return mergeAppData(next, next)
  }) })
}
export function saveLocalSettings(settings: AppSettings): Promise<AppSettings> {
  const validated = persistedSettingsSchema.parse(settings)
  return enqueue(async () => { await updateFile((data) => ({ ...data, settings: validated })); return validated })
}
export function clearLocalCache(): void { localStorage.removeItem(CACHE_KEY) }
export async function eraseLocalData(): Promise<void> {
  await enqueue(async () => { await updateFile((data) => ({ ...emptyPayload(), deleted: [
    ...data.deleted,
    ...data.shops.map((shop) => tombstoneSchema.parse({ id: shop.id, type: 'shop', deletedAt: new Date().toISOString() })),
    ...data.visits.map((visit) => tombstoneSchema.parse({ id: visit.id, type: 'visit', deletedAt: new Date().toISOString() })),
  ] })) })
  clearLocalCache()
}

function emptyPayloadWithRecords(shops: Shop[], visits: Visit[], settings: AppSettings, deleted: Tombstone[]): AppData {
  return { shops, visits, settings, deleted }
}
