/**
 * Settings + encryption-mode storage (the `meta` table).
 *
 * Small enough to keep in one module: it is the single place that reads and
 * writes the `encryption` and `settings` rows, so the rest of the app never
 * touches IndexedDB meta directly.
 */
import { openDatabase, db } from './database/db'
import { META_KEYS } from './database/schema'
import type { AppSettings } from '@/types'
import type { EncryptionMeta } from './types'
import { DEFAULT_SETTINGS } from '@/types'
import { makeMetaRecord } from './codec'

export async function getMeta<T>(key: string): Promise<T | null> {
  await openDatabase()
  const row = await db.meta.get(key)
  return (row?.value as T) ?? null
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await openDatabase()
  await db.meta.put(makeMetaRecord(key, value))
}

export async function deleteMeta(key: string): Promise<void> {
  await openDatabase()
  await db.meta.delete(key)
}

/* ------------------------------- encryption ------------------------------ */

export async function getEncryptionMeta(): Promise<EncryptionMeta> {
  const stored = await getMeta<EncryptionMeta>(META_KEYS.encryption)
  if (stored && typeof stored === 'object' && 'mode' in stored) return stored
  return { mode: 'none', createdAt: new Date().toISOString(), version: 1 }
}

export async function saveEncryptionMeta(meta: EncryptionMeta): Promise<void> {
  await setMeta(META_KEYS.encryption, meta)
}

/** Turn encryption off (records are rewritten in plain mode by the caller). */
export async function clearEncryptionMeta(): Promise<void> {
  await saveEncryptionMeta({
    mode: 'none',
    createdAt: new Date().toISOString(),
    version: 1,
  })
}

/* -------------------------------- settings ------------------------------- */

export async function getSettings(): Promise<AppSettings> {
  const stored = await getMeta<Partial<AppSettings>>(META_KEYS.settings)
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings()
  const next = { ...current, ...patch }
  await setMeta(META_KEYS.settings, next)
  return next
}
