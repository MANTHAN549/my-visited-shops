import { describe, expect, it } from 'vitest'
import { mergeLegacyData } from '@/migration/mergeLegacyData'
import type { LegacyData } from '@/migration/readLegacyData'

const settings = { mapLayer: 'osm' as const, reverseGeocodingEnabled: false, routingBaseUrl: 'https://router.project-osrm.org', routingProfile: 'driving' as const, geocodingBaseUrl: 'https://nominatim.openstreetmap.org', autoLockMinutes: 15, mobileListFirst: true }
const shop = { id: 's1', name: 'shop', category: '', address: '', latitude: 0, longitude: 0, primaryOwnerName: '', primaryOwnerPhone: '', contacts: [], notes: '', tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', lastVisitedAt: null, visitCount: 0 }
const visit = { id: 'v1', shopId: 's1', visitedAt: '2026-02-01T00:00:00.000Z', note: 'visit', purpose: '', amountSpent: '', createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' }
const source = (shops: LegacyData['shops'] = [], visits: LegacyData['visits'] = []): LegacyData => ({ shops, visits, settings, deleted: [], invalid: [] })

describe('legacy migration merge', () => {
  it('keeps newest records, recalculates rollups, and retains orphan visits idempotently', () => {
    const input = source([shop], [visit, { ...visit, id: 'orphan', shopId: 'missing' }])
    const once = mergeLegacyData(source(), input)
    const twice = mergeLegacyData(once, input)
    expect(once).toEqual(twice)
    expect(once.shops[0]?.visitCount).toBe(1)
    expect(once.shops[0]?.lastVisitedAt).toBe(visit.visitedAt)
    expect(once.visits.map((item) => item.id).sort()).toEqual(['orphan', 'v1'])
  })

  it('applies tombstones to older copies', () => {
    const deleted = { ...source([shop]), deleted: [{ id: 's1', type: 'shop' as const, deletedAt: '2026-03-01T00:00:00.000Z' }] }
    expect(mergeLegacyData(source(), deleted).shops).toHaveLength(0)
  })
})
