import type { BackupFile, BackupPayload, Shop, Visit } from '@/types'
import { BACKUP_FORMAT_VERSION, DEFAULT_SETTINGS } from '@/types'
import { nowIso } from '@/utils/format'
import { decryptString, deriveKey, encryptString, randomBytes, bytesToBase64 } from './githubCrypto'
import { refreshGithubData, mergeAndUploadGithubData, replaceGithubPayload } from './githubStore'
import { persistedSettingsSchema, persistedShopSchema, persistedVisitSchema } from './persistedSchemas'

export const BACKUP_MIME = 'application/json'
export interface ExportOptions { password?: string; encrypt: boolean; includeSettings?: boolean }
export interface BackupPreview {
  envelope: BackupFile
  payload: BackupPayload | null
  counts: { shops: number; visits: number }
  duplicateShopIds: string[]
  duplicateVisitIds: string[]
  conflicts: Array<{ id: string; name: string; reason: string }>
  orphanVisitCount: number
  exportedAt: string
  encrypted: boolean
}
export interface RestoreOptions { mode: 'merge' | 'replace'; applySettings?: boolean; recomputeRollups?: boolean }
export interface RestoreResult { importedShops: number; importedVisits: number; skippedShops: number; skippedVisits: number; mode: 'merge' | 'replace' }

export function backupFilename(): string { return `my-visited-shops-backup-${new Date().toISOString().slice(0, 10)}.json` }
async function digest(text: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return [...hash].map((value) => value.toString(16).padStart(2, '0')).join('')
}
export async function buildBackup(options: ExportOptions): Promise<{ filename: string; content: string; counts: { shops: number; visits: number }; encrypted: boolean }> {
  const data = await refreshGithubData()
  const payload: BackupPayload = { shops: data.shops, visits: data.visits, settings: options.includeSettings === false ? undefined : data.settings }
  const plaintext = JSON.stringify(payload)
  const envelope: BackupFile = { format: 'my-visited-shops-backup', version: BACKUP_FORMAT_VERSION, exportedAt: nowIso(), encrypted: options.encrypt, integrity: await digest(plaintext), counts: { shops: data.shops.length, visits: data.visits.length }, app: { name: 'My Visited Shops', version: '1.0.0' } }
  if (options.encrypt) {
    if (!options.password) throw new Error('A backup password is required to create an encrypted backup.')
    const salt = bytesToBase64(randomBytes(16)), iterations = 600_000, key = await deriveKey(options.password, salt, iterations)
    const cipher = await encryptString(key, plaintext)
    envelope.cipher = { algorithm: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations, salt, iv: cipher.iv, ciphertext: cipher.ciphertext }
  } else envelope.data = payload
  return { filename: backupFilename(), content: JSON.stringify(envelope, null, 2), counts: envelope.counts, encrypted: envelope.encrypted }
}
export function parseBackupFile(raw: string): BackupFile {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('This file is not valid JSON.') }
  if (!parsed || typeof parsed !== 'object') throw new Error('This file does not look like a backup.')
  const file = parsed as Partial<BackupFile>
  if (file.format !== 'my-visited-shops-backup' || typeof file.version !== 'number' || file.version > BACKUP_FORMAT_VERSION) throw new Error('This backup format is invalid or newer than this app.')
  if (file.encrypted && !file.cipher?.ciphertext) throw new Error('The encrypted backup is incomplete.')
  if (!file.encrypted && !file.data) throw new Error('The backup contains no data.')
  return file as BackupFile
}
export async function previewBackup(envelope: BackupFile, password?: string): Promise<BackupPreview> {
  if (envelope.encrypted && !password) return { envelope, payload: null, counts: envelope.counts, duplicateShopIds: [], duplicateVisitIds: [], conflicts: [], orphanVisitCount: 0, exportedAt: envelope.exportedAt, encrypted: true }
  let rawPayload: unknown = envelope.data
  if (envelope.encrypted) {
    const cipher = envelope.cipher!
    try { rawPayload = JSON.parse(await decryptString(await deriveKey(password!, cipher.salt, cipher.iterations), cipher.iv, cipher.ciphertext)) }
    catch { throw new Error('Wrong backup password or damaged backup.') }
  }
  if (!rawPayload || typeof rawPayload !== 'object') throw new Error('Backup data is malformed.')
  const candidate = rawPayload as Partial<BackupPayload>
  if (!Array.isArray(candidate.shops) || !Array.isArray(candidate.visits)) throw new Error('Backup shops or visits are missing.')
  if (envelope.integrity && await digest(JSON.stringify(rawPayload)) !== envelope.integrity) throw new Error('Backup integrity check failed.')
  const shops: Shop[] = candidate.shops.map((item) => persistedShopSchema.parse(item))
  const shopIds = new Set(shops.map((item) => item.id))
  const visits: Visit[] = candidate.visits.map((item) => persistedVisitSchema.parse(item))
  const current = await refreshGithubData()
  const duplicateShopIds = shops.filter((item) => current.shops.some((old) => old.id === item.id)).map((item) => item.id)
  const duplicateVisitIds = visits.filter((item) => current.visits.some((old) => old.id === item.id)).map((item) => item.id)
  const conflicts = shops.filter((item) => current.shops.some((old) => old.id === item.id && old.updatedAt !== item.updatedAt)).map((item) => ({ id: item.id, name: item.name, reason: 'Same id exists with a different updated timestamp.' }))
  const orphanVisitCount = visits.filter((item) => !shopIds.has(item.shopId)).length
  const settings = candidate.settings ? persistedSettingsSchema.parse(candidate.settings) : DEFAULT_SETTINGS
  return { envelope, payload: { shops, visits, settings }, counts: { shops: shops.length, visits: visits.length }, duplicateShopIds, duplicateVisitIds, conflicts, orphanVisitCount, exportedAt: envelope.exportedAt, encrypted: envelope.encrypted }
}
export async function restoreBackup(preview: BackupPreview, options: RestoreOptions): Promise<RestoreResult> {
  if (!preview.payload) throw new Error('Decrypt the backup before restoring it.')
  const incoming = { shops: preview.payload.shops, visits: preview.payload.visits, settings: options.applySettings ? persistedSettingsSchema.parse(preview.payload.settings ?? DEFAULT_SETTINGS) : (await refreshGithubData()).settings, deleted: [] }
  if (options.mode === 'replace') await replaceGithubPayload(incoming)
  else await mergeAndUploadGithubData(incoming)
  return { importedShops: incoming.shops.length, importedVisits: incoming.visits.length, skippedShops: 0, skippedVisits: 0, mode: options.mode }
}
export async function readBackupFile(file: File): Promise<string> {
  if (file.size > 25 * 1024 * 1024) throw new Error('Backup exceeds the 25 MB file limit.')
  return file.text()
}

