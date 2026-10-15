import { describe, expect, it, vi } from 'vitest'
import { readIndexedDb } from '@/migration/readLegacyData'

vi.mock('@/migration/legacy/database/db', () => ({
  openDatabase: async () => undefined,
  closeDatabase: async () => undefined,
  db: {
    shops: { toArray: async () => [{ id: 'bad-shop' }] },
    visits: { toArray: async () => [{ id: 'orphan-visit' }] },
    meta: { get: async () => ({ value: { mapLayer: 'osm', reverseGeocodingEnabled: false, routingBaseUrl: 'https://router.project-osrm.org', routingProfile: 'driving', geocodingBaseUrl: 'https://nominatim.openstreetmap.org', autoLockMinutes: 15, mobileListFirst: true } }) },
  },
}))
vi.mock('@/migration/legacy/database/schema', () => ({ META_KEYS: { settings: 'settings' } }))
vi.mock('@/migration/legacy/codec', () => ({ decodeShop: async () => ({}), decodeVisit: async () => ({ id: 'orphan-visit', shopId: 'missing-shop', visitedAt: '2026-10-14T00:00:00.000Z', note: '', purpose: '', amountSpent: '', createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z' }) }))
vi.mock('@/migration/legacy/settingsService', () => ({ getEncryptionMeta: async () => ({ mode: 'none', createdAt: '', version: 1 }), getSettings: async () => ({ mapLayer: 'osm', reverseGeocodingEnabled: false, routingBaseUrl: 'https://router.project-osrm.org', routingProfile: 'driving', geocodingBaseUrl: 'https://nominatim.openstreetmap.org', autoLockMinutes: 15, mobileListFirst: true }) }))
vi.mock('@/migration/legacy/encryptionService', () => ({ getSessionKey: () => null, setSessionKey: vi.fn(), unlockWithPassword: vi.fn() }))

describe('legacy migration reader', () => {
  it('reports invalid rows and retains orphan visits for migration preview', async () => {
    const data = await readIndexedDb()
    expect(data.invalid).toHaveLength(1)
    expect(data.invalid[0]?.id).toBe('bad-shop')
    expect(data.visits.map((visit) => visit.id)).toEqual(['orphan-visit'])
    expect(data.settings.mapLayer).toBe('osm')
  })
})
