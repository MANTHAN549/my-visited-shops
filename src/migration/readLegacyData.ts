import type { AppSettings, CloudRecord, Shop, Visit } from '@/types'
import { closeDatabase, db, openDatabase } from '@/database/db'
import { META_KEYS } from '@/database/schema'
import { decodeShop, decodeVisit } from '@/services/codec'
import { getEncryptionMeta, getSettings } from '@/services/settingsService'
import { getSessionKey, setSessionKey, unlockWithPassword } from '@/services/encryptionService'
import { getCurrentUser, getCloudKeyring } from '@/services/cloudAccountService'
import { decryptCloudJson, unlockCloudKeyring } from '@/services/cloudEncryptionService'
import { supabase } from '@/services/supabaseClient'
import { persistedSettingsSchema, persistedShopSchema, persistedVisitSchema, tombstoneSchema, type Tombstone } from '@/services/persistedSchemas'

export type InvalidLegacyRecord = { source: 'IndexedDB' | 'Supabase'; kind: string; id: string; raw: string; reason: string }
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

export async function readSupabaseData(password: string, recovery = false): Promise<LegacyData | null> {
  if (!supabase) throw new Error('Supabase is not configured in this build.')
  const user = await getCurrentUser()
  if (!user) return null
  const keyring = await getCloudKeyring(user.id)
  if (!keyring) throw new Error('This Supabase account has no cloud encryption keyring.')
  await unlockCloudKeyring(keyring, password, recovery)
  const { data, error } = await supabase.from('encrypted_records').select('*').eq('user_id', user.id)
  if (error) throw new Error(`Could not read Supabase records: ${error.message}`)
  const result = blank()
  for (const raw of (data ?? []) as CloudRecord[]) {
    if (raw.deleted_at) {
      const tombstone = tombstoneSchema.safeParse({ id: raw.id, type: raw.entity, deletedAt: raw.deleted_at })
      if (tombstone.success) result.deleted.push(tombstone.data)
      else result.invalid.push({ source: 'Supabase', kind: raw.entity, id: raw.id, raw: JSON.stringify(raw), reason: 'Cloud deletion record failed validation.' })
      continue
    }
    try {
      if (!raw.ciphertext || !raw.iv) throw new Error('Encrypted payload is missing.')
      const decoded = await decryptCloudJson<unknown>(raw.ciphertext, raw.iv)
      if (raw.entity === 'shop') {
        const parsed = persistedShopSchema.safeParse(decoded)
        if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join('; '))
        result.shops.push(parsed.data)
      } else {
        const parsed = persistedVisitSchema.safeParse(decoded)
        if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join('; '))
        result.visits.push(parsed.data)
      }
    } catch (error) {
      result.invalid.push({ source: 'Supabase', kind: raw.entity, id: raw.id, raw: JSON.stringify(raw), reason: error instanceof Error ? error.message : 'Could not decrypt or validate cloud record.' })
    }
  }
  return result
}

export async function clearLegacyLocalDatabase(): Promise<void> {
  await closeDatabase()
  await db.delete()
  await openDatabase()
  setSessionKey(null)
}
