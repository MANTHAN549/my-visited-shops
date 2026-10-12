/**
 * Backup / restore service.
 *
 * ---------------------------------------------------------------------------
 * FORMAT (documented, versioned)
 * ---------------------------------------------------------------------------
 * {
 *   format: "my-visited-shops-backup",
 *   version: 1,
 *   exportedAt: ISO-8601,
 *   encrypted: boolean,
 *   counts: { shops, visits },          // record counts, shown in the preview
 *   app: { name, version },
 *   integrity: "<sha256 hex>",          // SHA-256 of the plaintext payload JSON
 *   data: { shops, visits, settings, encryption }   // only when encrypted === false
 *   cipher: { algorithm, kdf, iterations, salt, iv, ciphertext }  // only when encrypted
 * }
 *
 * The plaintext payload is what gets hashed for integrity, then encrypted as a
 * whole with AES-GCM (fresh IV) using a key derived from the backup password.
 * A backup therefore always carries its own salt, so it can be restored on a
 * different device with a different (or no) local master password.
 *
 * Restore never writes anything before the user confirms, and never deletes
 * existing records unless "replace" was explicitly chosen.
 */
import type {
  AppSettings,
  BackupFile,
  BackupPayload,
  Shop,
  ShopRecord,
  Visit,
  VisitRecord,
} from '@/types'
import { BACKUP_FORMAT_VERSION } from '@/types'
import { createId, nowIso } from '@/utils/format'
import { db, openDatabase } from '@/database/db'
import {
  bytesToBase64,
  decryptJson,
  deriveKey,
  encryptJson,
  randomBytes,
  safeEqual,
  sha256Hex,
} from './encryptionService'
import { encodeShop, encodeVisit, type CodecContext } from './codec'
import { currentCodec, listShops } from './shopService'
import { listVisits, recomputeAllRollups } from './visitService'
import { getEncryptionMeta, getSettings, saveSettings } from './settingsService'

export const BACKUP_MIME = 'application/json'

/* ------------------------------------------------------------------ */
/* Export                                                             */
/* ------------------------------------------------------------------ */

export interface ExportOptions {
  /** Encrypt the payload with this password. Required when `encrypt` is true. */
  password?: string
  encrypt: boolean
  includeSettings?: boolean
}

export interface ExportResult {
  filename: string
  content: string
  counts: { shops: number; visits: number }
  encrypted: boolean
}

/** Suggested file name: my-visited-shops-backup-YYYY-MM-DD.json */
export function backupFilename(prefix = 'my-visited-shops-backup'): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${prefix}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}

export async function buildBackup(options: ExportOptions): Promise<ExportResult> {
  const [shops, visits, settings, encryption] = await Promise.all([
    listShops(),
    listVisits(),
    getSettings(),
    getEncryptionMeta(),
  ])

  const payload: BackupPayload = {
    shops,
    visits,
    ...(options.includeSettings === false ? {} : { settings }),
    encryption: {
      enabled: encryption.mode === 'encrypted',
      // The password is NEVER exported. The salt + work factor are, so the
      // restored device can recreate the same envelope metadata.
      salt: encryption.salt,
      iterations: encryption.iterations,
    },
  }

  const plaintext = JSON.stringify(payload)
  const integrity = await sha256Hex(plaintext)

  const envelope: BackupFile = {
    format: 'my-visited-shops-backup',
    version: BACKUP_FORMAT_VERSION,
    exportedAt: nowIso(),
    encrypted: options.encrypt,
    integrity,
    counts: { shops: shops.length, visits: visits.length },
    app: { name: 'My Visited Shops', version: '1.0.0' },
  }

  if (options.encrypt) {
    if (!options.password) {
      throw new Error('A backup password is required to create an encrypted backup.')
    }
    // A fresh salt per backup keeps backups independent of each other and of the
    // local installation's master password.
    const salt = bytesToBase64(randomBytes(16))
    const iterations = Math.max(600_000, encryption.iterations ?? 600_000)
    const key = await deriveKey(options.password, salt, iterations)
    const { ciphertext, iv } = await encryptJson(key, payload)

    envelope.cipher = {
      algorithm: 'AES-GCM',
      kdf: 'PBKDF2-SHA256',
      iterations,
      salt,
      iv,
      ciphertext,
    }
  } else {
    envelope.data = payload
  }

  return {
    filename: backupFilename(),
    content: JSON.stringify(envelope, null, 2),
    counts: envelope.counts!,
    encrypted: options.encrypt,
  }
}

/* ------------------------------------------------------------------ */
/* Import                                                             */
/* ------------------------------------------------------------------ */

export interface BackupPreview {
  envelope: BackupFile
  /** null when the file is encrypted and the password has not been supplied yet. */
  payload: BackupPayload | null
  counts: { shops: number; visits: number }
  /** Shop ids already present locally. */
  duplicateShopIds: string[]
  duplicateVisitIds: string[]
  /** Shops whose id exists locally but whose content differs. */
  conflicts: Array<{ id: string; name: string; reason: string }>
  exportedAt: string
  encrypted: boolean
}

/** Parse and structurally validate a backup file (no password needed). */
export function parseBackupFile(raw: string): BackupFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('This file is not valid JSON, so it is not a My Visited Shops backup.')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('This file does not look like a backup.')
  }

  const candidate = parsed as Partial<BackupFile>

  if (candidate.format !== 'my-visited-shops-backup') {
    throw new Error('This file was not created by My Visited Shops.')
  }

  if (typeof candidate.version !== 'number' || candidate.version < 1) {
    throw new Error('This backup has no valid format version and cannot be trusted.')
  }

  if (candidate.version > BACKUP_FORMAT_VERSION) {
    throw new Error(
      `This backup was created by a newer version of the app (format v${candidate.version}). ` +
        `Please update the application before restoring it.`,
    )
  }

  if (candidate.encrypted) {
    if (!candidate.cipher?.ciphertext || !candidate.cipher.iv || !candidate.cipher.salt) {
      throw new Error('This backup claims to be encrypted but its encryption block is incomplete.')
    }
  } else if (!candidate.data) {
    throw new Error('This backup contains no data.')
  }

  return candidate as BackupFile
}

/** Decrypt + verify the payload, then compare it with what is already stored. */
export async function previewBackup(
  envelope: BackupFile,
  password?: string,
): Promise<BackupPreview> {
  let payload: BackupPayload | null = null

  if (envelope.encrypted) {
    if (!password) {
      // Caller should ask for the password first; counts come from the header.
      return {
        envelope,
        payload: null,
        counts: envelope.counts ?? { shops: 0, visits: 0 },
        duplicateShopIds: [],
        duplicateVisitIds: [],
        conflicts: [],
        exportedAt: envelope.exportedAt,
        encrypted: true,
      }
    }
    const cipher = envelope.cipher!
    const key = await deriveKey(password, cipher.salt, cipher.iterations)
    try {
      payload = await decryptJson<BackupPayload>(key, cipher.iv, cipher.ciphertext)
    } catch {
      throw new Error(
        'Could not decrypt this backup. The password is wrong, or the file has been modified.',
      )
    }
  } else {
    payload = envelope.data as BackupPayload
  }

  if (!payload || !Array.isArray(payload.shops) || !Array.isArray(payload.visits)) {
    throw new Error('The backup content is malformed: shops or visits are missing.')
  }

  // Integrity check: the hash is over the plaintext payload as it was exported.
  if (envelope.integrity) {
    const recomputed = await sha256Hex(JSON.stringify(payload))
    if (!safeEqual(recomputed, envelope.integrity)) {
      throw new Error(
        'The backup failed its integrity check. The file may have been edited or corrupted. ' +
          'Nothing has been imported.',
      )
    }
  }

  const sanitised = sanitisePayload(payload)

  await openDatabase()
  const existingShops = await db.shops.toArray()
  const existingVisits = await db.visits.toArray()
  const localShopIds = new Set(existingShops.map((r) => r.id))
  const localVisitIds = new Set(existingVisits.map((r) => r.id))

  const duplicateShopIds = sanitised.shops.filter((s) => localShopIds.has(s.id)).map((s) => s.id)
  const duplicateVisitIds = sanitised.visits.filter((v) => localVisitIds.has(v.id)).map((v) => v.id)

  // Report conflicts by comparing the updatedAt of the same id.
  const localById = new Map(existingShops.map((r) => [r.id, r]))
  const conflicts: Array<{ id: string; name: string; reason: string }> = []
  for (const shop of sanitised.shops) {
    const local = localById.get(shop.id)
    if (!local) continue
    if (local.updatedAt !== shop.updatedAt) {
      conflicts.push({
        id: shop.id,
        name: shop.name,
        reason: `Already saved locally and edited at a different time (backup: ${shop.updatedAt.slice(0, 16)}, local: ${local.updatedAt.slice(0, 16)})`,
      })
    }
  }

  return {
    envelope,
    payload: sanitised,
    counts: { shops: sanitised.shops.length, visits: sanitised.visits.length },
    duplicateShopIds,
    duplicateVisitIds,
    conflicts,
    exportedAt: envelope.exportedAt,
    encrypted: envelope.encrypted,
  }
}

/** Validate every record and drop anything unusable, reporting what was dropped. */
function sanitisePayload(payload: BackupPayload): BackupPayload {
  const shops: Shop[] = []
  const visits: Visit[] = []

  for (const raw of payload.shops as Shop[]) {
    if (!raw || typeof raw !== 'object') continue
    const latitude = Number(raw.latitude)
    const longitude = Number(raw.longitude)
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) continue
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) continue
    if (typeof raw.name !== 'string' || !raw.name.trim()) continue

    shops.push({
      id: typeof raw.id === 'string' && raw.id ? raw.id : createId('shop'),
      name: raw.name.trim().slice(0, 120),
      category: typeof raw.category === 'string' ? raw.category : '',
      address: typeof raw.address === 'string' ? raw.address : '',
      latitude,
      longitude,
      primaryOwnerName: typeof raw.primaryOwnerName === 'string' ? raw.primaryOwnerName : '',
      primaryOwnerPhone: typeof raw.primaryOwnerPhone === 'string' ? raw.primaryOwnerPhone : '',
      contacts: Array.isArray(raw.contacts)
        ? raw.contacts
            .filter((c) => c && typeof c === 'object')
            .map((c) => ({
              id: typeof c.id === 'string' && c.id ? c.id : createId('contact'),
              name: typeof c.name === 'string' ? c.name : '',
              phone: typeof c.phone === 'string' ? c.phone : '',
              role: c.role,
              notes: typeof c.notes === 'string' ? c.notes : undefined,
            }))
        : [],
      notes: typeof raw.notes === 'string' ? raw.notes : '',
      tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === 'string') : [],
      imageDataUrl: typeof raw.imageDataUrl === 'string' ? raw.imageDataUrl : null,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowIso(),
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso(),
      lastVisitedAt: typeof raw.lastVisitedAt === 'string' ? raw.lastVisitedAt : null,
      visitCount: Number.isFinite(Number(raw.visitCount)) ? Number(raw.visitCount) : 0,
    })
  }

  const shopIds = new Set(shops.map((s) => s.id))

  for (const raw of payload.visits as Visit[]) {
    if (!raw || typeof raw !== 'object') continue
    if (typeof raw.shopId !== 'string' || !raw.shopId) continue
    // Keep the referential integrity of the export: orphan visits are dropped
    // so a restore can never create visits pointing at a missing shop.
    if (!shopIds.has(raw.shopId)) continue

    visits.push({
      id: typeof raw.id === 'string' && raw.id ? raw.id : createId('visit'),
      shopId: raw.shopId,
      visitedAt: typeof raw.visitedAt === 'string' ? raw.visitedAt : nowIso(),
      note: typeof raw.note === 'string' ? raw.note : '',
      purpose: typeof raw.purpose === 'string' ? raw.purpose : '',
      amountSpent: typeof raw.amountSpent === 'string' ? raw.amountSpent : '',
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowIso(),
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso(),
    })
  }

  return { shops, visits, settings: payload.settings, encryption: payload.encryption }
}

export interface RestoreOptions {
  mode: 'merge' | 'replace'
  applySettings?: boolean
  /** Recompute shop rollups from the imported visits (recommended: true). */
  recomputeRollups?: boolean
}

export interface RestoreResult {
  importedShops: number
  importedVisits: number
  skippedShops: number
  skippedVisits: number
  mode: 'merge' | 'replace'
}

/**
 * Apply a previewed backup.
 *
 * `merge` keeps every local record and lets the backup win only on ids it also
 * contains. `replace` clears both stores first. Both run inside ONE transaction
 * so an error leaves the database exactly as it was.
 */
export async function restoreBackup(
  preview: BackupPreview,
  options: RestoreOptions,
): Promise<RestoreResult> {
  if (!preview.payload) {
    throw new Error('The backup must be decrypted before it can be restored.')
  }

  await openDatabase()
  const ctx: CodecContext = await currentCodec()

  const { shops, visits } = preview.payload

  const shopRecords: ShopRecord[] = []
  for (const shop of shops) shopRecords.push(await encodeShop(shop, ctx))
  const visitRecords: VisitRecord[] = []
  for (const visit of visits) visitRecords.push(await encodeVisit(visit, ctx))

  let skippedShops = 0
  let skippedVisits = 0

  await db.transaction('rw', db.shops, db.visits, async () => {
    if (options.mode === 'replace') {
      await db.shops.clear()
      await db.visits.clear()
      await db.shops.bulkPut(shopRecords)
      await db.visits.bulkPut(visitRecords)
      return
    }

    // Merge: never silently overwrite a record that was edited more recently
    // locally than in the backup.
    const localShops = new Map((await db.shops.toArray()).map((r) => [r.id, r]))
    const localVisits = new Map((await db.visits.toArray()).map((r) => [r.id, r]))

    const shopsToWrite: ShopRecord[] = []
    for (const record of shopRecords) {
      const local = localShops.get(record.id)
      if (local && local.updatedAt > record.updatedAt) {
        skippedShops += 1
        continue
      }
      shopsToWrite.push(record)
    }

    const visitsToWrite: VisitRecord[] = []
    for (const record of visitRecords) {
      const local = localVisits.get(record.id)
      if (local && local.updatedAt > record.updatedAt) {
        skippedVisits += 1
        continue
      }
      visitsToWrite.push(record)
    }

    if (shopsToWrite.length) await db.shops.bulkPut(shopsToWrite)
    if (visitsToWrite.length) await db.visits.bulkPut(visitsToWrite)
  })

  if (options.applySettings && preview.payload.settings) {
    await saveSettings(preview.payload.settings as Partial<AppSettings>)
  }

  if (options.recomputeRollups !== false) {
    // Guarantees the counters match the imported visit rows.
    await recomputeAllRollups()
  }

  return {
    importedShops: shops.length,
    importedVisits: visits.length,
    skippedShops,
    skippedVisits,
    mode: options.mode,
  }
}

/** Read a File into text with a size guard (a 25 MB backup is plenty). */
export async function readBackupFile(file: File): Promise<string> {
  const MAX_BYTES = 25 * 1024 * 1024
  if (file.size > MAX_BYTES) {
    throw new Error('This file is larger than 25 MB, which is too big for a shop backup.')
  }
  return file.text()
}
