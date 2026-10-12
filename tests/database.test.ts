import { beforeEach, describe, expect, it } from 'vitest'
import { db, openDatabase } from '@/database/db'
import { META_KEYS } from '@/database/schema'
import { createShop, listShops, searchShops, updateShop, deleteShop, getShop, findPossibleDuplicates } from '@/services/shopService'
import { createVisit, deleteVisit, listVisits, listVisitsForShop, listVisitsWithShops } from '@/services/visitService'
import { getEncryptionMeta, saveEncryptionMeta, getSettings, saveSettings } from '@/services/settingsService'
import { clearSessionKey, setSessionKey } from '@/services/encryptionService'
import { SENSITIVE_SHOP_FIELDS } from '@/database/schema'

const sampleInput = {
  name: 'Sharma Electricals',
  category: 'Electronics',
  address: '12 MG Road, Pune',
  latitude: 18.5204,
  longitude: 73.8567,
  primaryOwnerName: 'Ramesh Sharma',
  primaryOwnerPhone: '+91 98765 43210',
  contacts: [
    { id: 'c1', name: 'Suresh Sharma', phone: '+91 98123 45678', role: 'Manager' as const },
  ],
  notes: 'Best prices on wires.',
  tags: ['hardware', 'wholesale'],
  imageDataUrl: null,
}

async function resetDatabase() {
  await openDatabase()
  await db.shops.clear()
  await db.visits.clear()
  await db.meta.clear()
  clearSessionKey()
}

describe('shop and visit persistence', () => {
  beforeEach(resetDatabase)

  it('saves a shop and reads it back with every field intact', async () => {
    const created = await createShop(sampleInput)
    const shops = await listShops()

    expect(shops).toHaveLength(1)
    expect(shops[0].id).toBe(created.id)
    expect(shops[0].name).toBe('Sharma Electricals')
    expect(shops[0].latitude).toBeCloseTo(18.5204)
    expect(shops[0].longitude).toBeCloseTo(73.8567)
    expect(shops[0].primaryOwnerPhone).toBe('+91 98765 43210')
    expect(shops[0].contacts).toHaveLength(1)
    expect(shops[0].tags).toEqual(['hardware', 'wholesale'])
    expect(shops[0].visitCount).toBe(0)
    expect(shops[0].lastVisitedAt).toBeNull()
  })

  it('survives a simulated page refresh (data is read from IndexedDB)', async () => {
    await createShop(sampleInput)
    // A refresh means new reads against the same database, not new state.
    const firstRead = await listShops()
    const secondRead = await listShops()
    expect(secondRead).toHaveLength(1)
    expect(secondRead[0].id).toBe(firstRead[0].id)
  })

  it('updates a shop without touching its visit history', async () => {
    const shop = await createShop(sampleInput)
    await createVisit({
      shopId: shop.id,
      visitedAt: '2026-03-01T10:00:00.000Z',
      note: 'Bought wire',
      purpose: 'Purchase',
      amountSpent: '500',
    })

    await updateShop(shop.id, { ...sampleInput, name: 'Sharma Electricals & Hardware' })

    const updated = await getShop(shop.id)
    const visits = await listVisitsForShop(shop.id)

    expect(updated?.name).toBe('Sharma Electricals & Hardware')
    expect(visits).toHaveLength(1)
    expect(visits[0].note).toBe('Bought wire')
    expect(updated?.visitCount).toBe(1)
  })

  it('keeps separate visit records for the same shop on different dates', async () => {
    const shop = await createShop(sampleInput)

    await createVisit({
      shopId: shop.id,
      visitedAt: '2026-01-05T09:00:00.000Z',
      note: 'First visit',
      purpose: 'Enquiry',
      amountSpent: '',
    })
    await createVisit({
      shopId: shop.id,
      visitedAt: '2026-02-11T15:30:00.000Z',
      note: 'Second visit',
      purpose: 'Purchase',
      amountSpent: '1250',
    })

    const visits = await listVisitsForShop(shop.id)
    expect(visits).toHaveLength(2)
    // Sorted newest first.
    expect(visits[0].note).toBe('Second visit')
    expect(visits[1].note).toBe('First visit')

    // Older messages must never be overwritten.
    expect(visits.map((v) => v.note)).toContain('First visit')

    const updated = await getShop(shop.id)
    expect(updated?.visitCount).toBe(2)
    expect(updated?.lastVisitedAt).toBe('2026-02-11T15:30:00.000Z')
  })

  it('recomputes the visit count when a visit is deleted', async () => {
    const shop = await createShop(sampleInput)
    const visit = await createVisit({
      shopId: shop.id,
      visitedAt: '2026-04-01T12:00:00.000Z',
      note: 'Only visit',
      purpose: '',
      amountSpent: '',
    })

    await deleteVisit(visit.id)

    const updated = await getShop(shop.id)
    expect(updated?.visitCount).toBe(0)
    expect(updated?.lastVisitedAt).toBeNull()
  })

  it('links visits to their shop and drops nothing on read', async () => {
    const shop = await createShop(sampleInput)
    await createVisit({
      shopId: shop.id,
      visitedAt: '2026-05-05T08:00:00.000Z',
      note: 'Linked visit',
      purpose: 'Payment',
      amountSpent: '2000',
    })

    const joined = await listVisitsWithShops()
    expect(joined).toHaveLength(1)
    expect(joined[0].shop?.id).toBe(shop.id)
    expect(joined[0].shop?.name).toBe('Sharma Electricals')
  })

  it('deletes a shop together with its visits when asked', async () => {
    const shop = await createShop(sampleInput)
    await createVisit({
      shopId: shop.id,
      visitedAt: '2026-06-01T10:00:00.000Z',
      note: 'Will be removed',
      purpose: '',
      amountSpent: '',
    })

    await deleteShop(shop.id, true)

    expect(await listShops()).toHaveLength(0)
    expect(await listVisits()).toHaveLength(0)
  })

  it('keeps visits when the shop is deleted without them', async () => {
    const shop = await createShop(sampleInput)
    await createVisit({
      shopId: shop.id,
      visitedAt: '2026-06-02T10:00:00.000Z',
      note: 'Kept note',
      purpose: '',
      amountSpent: '',
    })

    await deleteShop(shop.id, false)

    expect(await listShops()).toHaveLength(0)
    expect(await listVisits()).toHaveLength(1)
  })

  it('searches across name, address, owner, phone, category, notes and tags', async () => {
    await createShop(sampleInput)
    await createShop({
      ...sampleInput,
      name: 'Gupta Hardware',
      category: 'Hardware',
      primaryOwnerName: 'Suresh Gupta',
      contacts: [{ id: 'c2', name: 'Mahesh Gupta', phone: '+91 98123 45678', role: 'Manager' as const }],
      tags: ['tools'],
    })

    expect(searchShops(await listShops(), 'sharma')).toHaveLength(1)
    expect(searchShops(await listShops(), 'MG Road')).toHaveLength(2)
    expect(searchShops(await listShops(), 'ramesh')).toHaveLength(1)
    expect(searchShops(await listShops(), '98765')).toHaveLength(2)
    expect(searchShops(await listShops(), 'electronics')).toHaveLength(1)
    expect(searchShops(await listShops(), 'wires')).toHaveLength(2)
    expect(searchShops(await listShops(), 'tools')).toHaveLength(1)
    expect(searchShops(await listShops(), 'nonexistent-term')).toHaveLength(0)
  })

  it('warns about duplicates by phone, name and proximity without merging', async () => {
    await createShop(sampleInput)

    const byPhone = findPossibleDuplicates(await listShops(), {
      name: 'Different name',
      primaryOwnerPhone: '+919876543210',
      latitude: 0,
      longitude: 0,
    })
    expect(byPhone).toHaveLength(1)
    expect(byPhone[0].reason).toMatch(/phone/i)

    const byProximity = findPossibleDuplicates(await listShops(), {
      name: 'Completely different',
      primaryOwnerPhone: '',
      latitude: 18.5205,
      longitude: 73.8568,
    })
    expect(byProximity).toHaveLength(1)
    expect(byProximity[0].distanceMeters).toBeLessThan(50)

    // Still exactly one record: nothing was merged.
    expect(await listShops()).toHaveLength(1)
  })
})

describe('settings persistence', () => {
  beforeEach(resetDatabase)

  it('returns defaults and persists an update', async () => {
    const initial = await getSettings()
    expect(initial.mapLayer).toBe('osm')
    expect(initial.reverseGeocodingEnabled).toBe(false)

    await saveSettings({ mapLayer: 'topo', autoLockMinutes: 5 })
    const next = await getSettings()
    expect(next.mapLayer).toBe('topo')
    expect(next.autoLockMinutes).toBe(5)
  })

  it('defaults to unencrypted storage on a fresh install', async () => {
    const meta = await getEncryptionMeta()
    expect(meta.mode).toBe('none')
  })
})

describe('encrypted storage mode', () => {
  beforeEach(resetDatabase)

  it('stores no sensitive field in plaintext inside IndexedDB', async () => {
    const { createEncryptionMeta } = await import('@/services/encryptionService')
    const { meta, key } = await createEncryptionMeta('a-strong-master-password', 600_000)
    await saveEncryptionMeta(meta)
    setSessionKey(key)

    await createShop(sampleInput)
    await createVisit({
      shopId: (await listShops())[0].id,
      visitedAt: '2026-07-01T10:00:00.000Z',
      note: 'Confidential note about the owner',
      purpose: 'Purchase',
      amountSpent: '999',
    })

    // Inspect the RAW rows, bypassing the service layer entirely.
    const rawShops = await db.shops.toArray()
    const rawVisits = await db.visits.toArray()
    const rawDump = JSON.stringify([rawShops, rawVisits])

    expect(rawShops[0].enc).toBe(1)
    expect(rawVisits[0].enc).toBe(1)

    for (const field of SENSITIVE_SHOP_FIELDS) {
      expect(rawShops[0]).not.toHaveProperty(field)
    }

    expect(rawDump).not.toContain('Sharma Electricals')
    expect(rawDump).not.toContain('919876543210')
    expect(rawDump).not.toContain('MG Road')
    expect(rawDump).not.toContain('Confidential note')
    expect(rawDump).not.toContain('Best prices on wires')

    // The index fields the UI needs remain readable.
    expect(rawShops[0].id).toBeTruthy()
    expect(rawShops[0].visitCount).toBe(1)
    expect(rawVisits[0].shopId).toBe(rawShops[0].id)
    expect(rawVisits[0].visitedAt).toBe('2026-07-01T10:00:00.000Z')
  })

  it('refuses to read encrypted records while locked', async () => {
    const { createEncryptionMeta } = await import('@/services/encryptionService')
    const { meta, key } = await createEncryptionMeta('a-strong-master-password', 600_000)
    await saveEncryptionMeta(meta)
    setSessionKey(key)
    await createShop(sampleInput)

    clearSessionKey()

    await expect(listShops()).rejects.toThrow(/locked/i)
  })

  it('reads the encrypted records again after unlocking', async () => {
    const { createEncryptionMeta, unlockWithPassword } = await import('@/services/encryptionService')
    const { meta, key } = await createEncryptionMeta('a-strong-master-password', 600_000)
    await saveEncryptionMeta(meta)
    setSessionKey(key)
    await createShop(sampleInput)
    clearSessionKey()

    const unlocked = await unlockWithPassword('a-strong-master-password', meta)
    setSessionKey(unlocked)

    const shops = await listShops()
    expect(shops).toHaveLength(1)
    expect(shops[0].name).toBe('Sharma Electricals')
    expect(shops[0].notes).toBe('Best prices on wires.')
  })

  it('stores the encryption metadata under a single meta key', async () => {
    const { createEncryptionMeta } = await import('@/services/encryptionService')
    const { meta } = await createEncryptionMeta('metadata-check-password', 600_000)
    await saveEncryptionMeta(meta)

    const row = await db.meta.get(META_KEYS.encryption)
    expect(row).toBeTruthy()
    expect((row?.value as { mode: string }).mode).toBe('encrypted')
  })
})
