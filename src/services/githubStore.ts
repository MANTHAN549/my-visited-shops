import type { AppSettings, Shop, Visit } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'
import { decryptString, deriveKey, encryptString, randomBytes, bytesToBase64 } from './githubCrypto'
import { githubDocumentSchema, githubPayloadSchema, persistedSettingsSchema, persistedShopSchema, persistedVisitSchema, tombstoneSchema, type Tombstone } from './persistedSchemas'

const CACHE_KEY = 'gh_data_cache'
const SETTINGS_KEYS = ['gh_token', 'gh_owner', 'gh_repo', 'gh_branch'] as const
const ITERATIONS = 600_000
const API = 'https://api.github.com'
export type GithubConfig = { token: string; owner: string; repo: string; branch: string }
export type GithubPayload = { shops: Shop[]; visits: Visit[]; settings: AppSettings; deleted: Tombstone[] }
type WireDocument = { version: 2; updatedAt: string; encryption: { kdf: 'PBKDF2-SHA256'; iterations: number; salt: string; iv: string; ciphertext: string } }

let passphrase: string | null = null
let writes: Promise<unknown> = Promise.resolve()

export function setGithubPassphrase(value: string | null): void { passphrase = value }
export function hasGithubPassphrase(): boolean { return passphrase !== null }
export function getGithubConfig(): GithubConfig {
  return {
    token: localStorage.getItem('gh_token') ?? '',
    owner: localStorage.getItem('gh_owner') ?? '',
    repo: localStorage.getItem('gh_repo') ?? '',
    branch: localStorage.getItem('gh_branch') ?? 'main',
  }
}
export function saveGithubConfig(config: GithubConfig): void {
  for (const key of SETTINGS_KEYS) {
    const value = config[key.slice(3) as 'token' | 'owner' | 'repo' | 'branch'].trim()
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  }
}
export function removeGithubToken(): void { localStorage.removeItem('gh_token') }

function requiredConfig(): GithubConfig {
  const config = getGithubConfig()
  if (!config.token) throw new Error('Enter a GitHub token in Settings.')
  if (!config.owner || !config.repo || !config.branch) throw new Error('Enter the GitHub username, data repository, and branch in Settings.')
  return config
}
function fileUrl(config: GithubConfig): string {
  const owner = encodeURIComponent(config.owner), repo = encodeURIComponent(config.repo)
  const branch = encodeURIComponent(config.branch)
  return `${API}/repos/${owner}/${repo}/contents/data.json?ref=${branch}`
}
function apiError(status: number, retryAfter: string | null): Error {
  if (status === 401 || status === 403) return new Error(retryAfter ? 'GitHub rate limit reached. Try again later.' : 'GitHub rejected the token or it lacks Contents read/write permission.')
  if (status === 404) return new Error('GitHub repository or data.json was not found. Check the username, private repository, and token access.')
  if (status === 409 || status === 422) return new Error('GitHub detected a file update conflict.')
  return new Error(`GitHub request failed (HTTP ${status}).`)
}
function rateLimitSignal(response: Response): string | null {
  return response.headers.get('retry-after') ?? (response.headers.get('x-ratelimit-remaining') === '0' ? 'rate-limited' : null)
}
function checkOnline(write = false): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine && write) throw new Error('You are offline. Changes cannot be saved until you reconnect.')
}
function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  return btoa(binary)
}
function emptyPayload(): GithubPayload { return { shops: [], visits: [], settings: DEFAULT_SETTINGS, deleted: [] } }
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
export function mergeGithubPayload(base: GithubPayload, incoming: GithubPayload): GithubPayload {
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

async function decryptWire(wire: WireDocument): Promise<GithubPayload> {
  if (!passphrase) throw new Error('Enter the GitHub data passphrase to unlock your data.')
  const key = await deriveKey(passphrase, wire.encryption.salt, wire.encryption.iterations)
  let parsed: unknown
  try { parsed = JSON.parse(await decryptString(key, wire.encryption.iv, wire.encryption.ciphertext)) }
  catch { throw new Error('Wrong GitHub data passphrase, or encrypted data is damaged.') }
  const payload = githubPayloadSchema.safeParse(parsed)
  if (!payload.success) throw new Error('GitHub data is invalid. The downloaded records failed validation.')
  return payload.data
}
async function encryptPayload(payload: GithubPayload, salt: string): Promise<WireDocument> {
  if (!passphrase) throw new Error('Enter the GitHub data passphrase to unlock your data.')
  const validated = githubPayloadSchema.safeParse(payload)
  if (!validated.success) throw new Error('Changes failed persisted data validation.')
  const key = await deriveKey(passphrase, salt, ITERATIONS)
  const encrypted = await encryptString(key, JSON.stringify(validated.data))
  const wire: WireDocument = { version: 2, updatedAt: new Date().toISOString(), encryption: { kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt, iv: encrypted.iv, ciphertext: encrypted.ciphertext } }
  const size = new Blob([JSON.stringify(wire)]).size
  if (size > 50 * 1024 * 1024) throw new Error('GitHub data.json would exceed 50 MB. Compress or remove shop images before saving.')
  return wire
}
async function request(url: string, init: RequestInit): Promise<Response> {
  checkOnline(init.method === 'PUT')
  try { return await fetch(url, init) }
  catch { throw new Error('Could not reach GitHub. Check your internet connection and try again.') }
}
async function fetchFresh(): Promise<{ payload: GithubPayload; sha: string | null; salt: string }> {
  const config = requiredConfig()
  const response = await request(fileUrl(config), {
    method: 'GET', cache: 'no-store',
    headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/vnd.github.raw+json' },
  })
  if (response.status === 404) {
    const repoCheck = await request(`${API}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`, {
      method: 'GET', cache: 'no-store',
      headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/vnd.github+json' },
    })
    if (!repoCheck.ok) throw apiError(repoCheck.status, rateLimitSignal(repoCheck))
    localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 2, payload: emptyPayload() }))
    return { payload: emptyPayload(), sha: null, salt: bytesToBase64(randomBytes(16)) }
  }
  if (!response.ok) throw apiError(response.status, rateLimitSignal(response))
  let raw: unknown
  try { raw = await response.json() } catch { throw new Error('GitHub returned invalid JSON for data.json.') }
  const valid = githubDocumentSchema.safeParse(raw)
  if (!valid.success) throw new Error('GitHub data.json has an unsupported or invalid format.')
  const payload = await decryptWire(valid.data as WireDocument)
  const metadata = await request(fileUrl(config), {
    method: 'GET', cache: 'no-store',
    headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/vnd.github+json' },
  })
  if (!metadata.ok) throw apiError(metadata.status, rateLimitSignal(metadata))
  const metadataJson: unknown = await metadata.json()
  const sha = metadataJson && typeof metadataJson === 'object' && 'sha' in metadataJson && typeof metadataJson.sha === 'string'
    ? metadataJson.sha
    : null
  if (!sha) throw new Error('GitHub did not provide the current file revision.')
  localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 2, wire: valid.data }))
  return { payload, sha, salt: valid.data.encryption.salt }
}
export async function refreshGithubData(): Promise<GithubPayload> {
  try { return (await fetchFresh()).payload }
  catch (error) {
    if (error instanceof Error && /offline|could not reach github/i.test(error.message)) {
      const cache = localStorage.getItem(CACHE_KEY)
      if (cache) {
        const parsed: unknown = JSON.parse(cache)
        if (parsed && typeof parsed === 'object' && 'wire' in parsed) {
          const cachedDocument = githubDocumentSchema.safeParse(parsed.wire)
          if (cachedDocument.success) return await decryptWire(cachedDocument.data as WireDocument)
        }
        if (parsed && typeof parsed === 'object' && 'payload' in parsed) localStorage.removeItem(CACHE_KEY)
      }
    }
    throw error
  }
}
export async function mergeAndUploadGithubData(incoming: GithubPayload): Promise<GithubPayload> {
  return enqueue(() => updateFile((current, isNew) => {
    const combined = mergeGithubPayload(current, incoming)
    return {
      ...combined,
      settings: isNew ? incoming.settings : current.settings,
    }
  }))
}
export async function replaceGithubPayload(incoming: GithubPayload): Promise<GithubPayload> {
  return enqueue(() => updateFile((current) => {
    const keptIds = new Set([...incoming.shops.map((item) => `shop:${item.id}`), ...incoming.visits.map((item) => `visit:${item.id}`)])
    const deleted = [...incoming.deleted, ...current.deleted.filter((item) => !keptIds.has(`${item.type}:${item.id}`)), ...current.shops.filter((item) => !keptIds.has(`shop:${item.id}`)).map((item) => tombstoneSchema.parse({ id: item.id, type: 'shop', deletedAt: new Date().toISOString() })), ...current.visits.filter((item) => !keptIds.has(`visit:${item.id}`)).map((item) => tombstoneSchema.parse({ id: item.id, type: 'visit', deletedAt: new Date().toISOString() }))]
    return mergeGithubPayload(emptyPayload(), { ...incoming, deleted })
  }))
}
export async function testGithubConnection(): Promise<number> {
  const fresh = await fetchFresh()
  return new Blob([JSON.stringify(await encryptPayload(fresh.payload, fresh.salt))]).size
}
export async function initializeGithubStore(secret: string): Promise<void> {
  if (secret.length < 12) throw new Error('Use a GitHub data passphrase with at least 12 characters.')
  setGithubPassphrase(secret)
  const fresh = await fetchFresh()
  if (fresh.sha) return
  await enqueue(() => updateFile((current) => current))
}
async function updateFile(change: (current: GithubPayload, isNew: boolean) => GithubPayload): Promise<GithubPayload> {
  const config = requiredConfig()
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const fresh = await fetchFresh()
    const payload = githubPayloadSchema.parse(change(fresh.payload, fresh.sha === null))
    const wire = await encryptPayload(payload, fresh.salt)
    const body = { message: 'Update My Visited Shops data', content: encodeBase64(JSON.stringify(wire)), branch: config.branch, ...(fresh.sha ? { sha: fresh.sha } : {}) }
    const response = await request(fileUrl({ ...config, branch: config.branch }), {
      method: 'PUT', cache: 'no-store',
      headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (response.ok) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 2, wire }))
      return payload
    }
    lastError = apiError(response.status, rateLimitSignal(response))
    if (response.status !== 409 && response.status !== 422) throw lastError
  }
  throw lastError ?? new Error('GitHub could not save after three conflict retries.')
}
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const task = writes.then(operation, operation)
  writes = task.then(() => undefined, () => undefined)
  return task
}
export async function listShops(): Promise<Shop[]> { return (await refreshGithubData()).shops }
export async function getShop(id: string): Promise<Shop | null> { return (await listShops()).find((shop) => shop.id === id) ?? null }
export async function searchShops(query: string): Promise<Shop[]> {
  const needle = query.trim().toLocaleLowerCase()
  return (await listShops()).filter((shop) => !needle || [shop.name, shop.category, shop.address, shop.notes, shop.primaryOwnerName, shop.primaryOwnerPhone, ...shop.tags].some((field) => field.toLocaleLowerCase().includes(needle)))
}
export function addShop(shop: Shop): Promise<Shop> {
  return enqueue(async () => { const prepared = await compressShopImage(shop); await updateFile((data) => {
    const shops = mergeRecords(data.shops, [persistedShopSchema.parse(prepared)])
    return mergeGithubPayload({ ...data, shops }, emptyPayloadWithRecords(shops, data.visits, data.settings, data.deleted))
  }); return prepared })
}
export function updateShop(shop: Shop): Promise<Shop> { return addShop(shop) }
export function deleteShop(id: string, deleteVisits = true): Promise<void> {
  return enqueue(async () => { await updateFile((data) => {
    const deletedAt = new Date().toISOString()
    const affectedVisits = deleteVisits ? data.visits.filter((visit) => visit.shopId === id) : []
    const next: GithubPayload = { ...data, shops: data.shops.filter((shop) => shop.id !== id), visits: deleteVisits ? data.visits.filter((visit) => visit.shopId !== id) : data.visits, deleted: [
      ...data.deleted, tombstoneSchema.parse({ id, type: 'shop', deletedAt }),
      ...affectedVisits.map((visit) => tombstoneSchema.parse({ id: visit.id, type: 'visit', deletedAt })),
    ] }
    return mergeGithubPayload(next, next)
  }) })
}
export async function listVisits(): Promise<Visit[]> { return (await refreshGithubData()).visits }
export async function getVisit(id: string): Promise<Visit | null> { return (await listVisits()).find((visit) => visit.id === id) ?? null }
export async function searchVisits(query: string): Promise<Visit[]> {
  const needle = query.trim().toLocaleLowerCase()
  return (await listVisits()).filter((visit) => !needle || [visit.note, visit.purpose, visit.amountSpent].some((field) => field.toLocaleLowerCase().includes(needle)))
}
export function addVisit(visit: Visit): Promise<Visit> {
  return enqueue(async () => { await updateFile((data) => {
    const visits = mergeRecords(data.visits, [persistedVisitSchema.parse(visit)])
    return mergeGithubPayload({ ...data, visits }, emptyPayloadWithRecords(data.shops, visits, data.settings, data.deleted))
  }); return visit })
}
export function updateVisit(visit: Visit): Promise<Visit> { return addVisit(visit) }
export function deleteVisit(id: string): Promise<void> {
  return enqueue(async () => { await updateFile((data) => {
    const next: GithubPayload = { ...data, visits: data.visits.filter((visit) => visit.id !== id), deleted: [...data.deleted, tombstoneSchema.parse({ id, type: 'visit', deletedAt: new Date().toISOString() })] }
    return mergeGithubPayload(next, next)
  }) })
}
export function saveGithubSettings(settings: AppSettings): Promise<AppSettings> {
  const validated = persistedSettingsSchema.parse(settings)
  return enqueue(async () => { await updateFile((data) => ({ ...data, settings: validated })); return validated })
}
export function clearGithubCache(): void { localStorage.removeItem(CACHE_KEY) }
export async function eraseGithubData(): Promise<void> {
  await enqueue(async () => { await updateFile((data) => ({ ...emptyPayload(), deleted: [
    ...data.deleted,
    ...data.shops.map((shop) => tombstoneSchema.parse({ id: shop.id, type: 'shop', deletedAt: new Date().toISOString() })),
    ...data.visits.map((visit) => tombstoneSchema.parse({ id: visit.id, type: 'visit', deletedAt: new Date().toISOString() })),
  ] })) })
  clearGithubCache()
}

function emptyPayloadWithRecords(shops: Shop[], visits: Visit[], settings: AppSettings, deleted: Tombstone[]): GithubPayload {
  return { shops, visits, settings, deleted }
}
