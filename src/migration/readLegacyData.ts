import type { AppSettings, Shop, Visit } from '@/types'
import { closeDatabase, db, openDatabase } from './legacy/database/db'
import { META_KEYS } from './legacy/database/schema'
import { decodeShop, decodeVisit } from './legacy/codec'
import { getEncryptionMeta, getSettings } from './legacy/settingsService'
import { getSessionKey, setSessionKey, unlockWithPassword } from './legacy/encryptionService'
import { persistedSettingsSchema, persistedShopSchema, persistedVisitSchema, type Tombstone } from '@/services/persistedSchemas'

export type InvalidLegacyRecord = { source: 'IndexedDB'; kind: string; id: string; raw: string; reason: string }
export type LegacyData = {
  shops: Shop[]
  visits: Visit[]
  settings: AppSettings
  deleted: Tombstone[]
  invalid: InvalidLegacyRecord[]
}
function blank(): LegacyData { return { shops: [], visits: [], settings: awaitSettingsFallback(), deleted: [], invalid: [] } }
function awaitSettingsFallback(): AppSettings {
  return { mapLayer: 'osm', reverseGeocodingEnabled: false, routingBaseUrl: 'https://router.project-osrm.org', routingProfile: 'driving', geocodingBaseUrl: 'https://nominatim.openstreetmap.org', autoLockMinutes: 15, mobileListFirst: true }
}

export async function unlockLegacyStorage(password: string): Promise<void> {
  const meta = await getEncryptionMeta()
  if (meta.mode !== 'encrypted') return
  setSessionKey(await unlockWithPassword(password, meta))
}

export async function readIndexedDb(): Promise<LegacyData> {
  await openDatabase()
  const result = blank()
  const meta = await getEncryptionMeta()
  const key = meta.mode === 'encrypted' ? getSessionKey() : null
  if (meta.mode === 'encrypted' && !key) throw new Error('Enter the old local master password first.')
  const context = { key }
  const [shopRows, visitRows, settingsRow] = await Promise.all([
    db.shops.toArray(), db.visits.toArray(), db.meta.get(META_KEYS.settings),
  ])
  for (const row of shopRows) {
    try {
      const parsed = persistedShopSchema.safeParse(await decodeShop(row, context))
      if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join('; '))
      result.shops.push(parsed.data)
    } catch (error) {
      result.invalid.push({ source: 'IndexedDB', kind: 'shop', id: row.id, raw: JSON.stringify(row), reason: error instanceof Error ? error.message : 'Could not decode or validate shop.' })
    }
  }
  for (const row of visitRows) {
    try {
      const parsed = persistedVisitSchema.safeParse(await decodeVisit(row, context))
      if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join('; '))
      result.visits.push(parsed.data)
    } catch (error) {
      result.invalid.push({ source: 'IndexedDB', kind: 'visit', id: row.id, raw: JSON.stringify(row), reason: error instanceof Error ? error.message : 'Could not decode or validate visit.' })
    }
  }
  if (settingsRow) {
    const parsed = persistedSettingsSchema.safeParse(settingsRow.value)
    if (parsed.success) result.settings = parsed.data
    else result.invalid.push({ source: 'IndexedDB', kind: 'settings', id: 'settings', raw: JSON.stringify(settingsRow.value), reason: parsed.error.issues.map((issue) => issue.message).join('; ') })
  } else {
    result.settings = await getSettings()
  }
  return result
}

export async function clearLegacyLocalDatabase(): Promise<void> {
  await closeDatabase()
  await db.delete()
  await openDatabase()
  setSessionKey(null)
}
