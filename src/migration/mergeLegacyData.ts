import type { LegacyData } from './readLegacyData'

export function mergeLegacyData(left: LegacyData, right: LegacyData): LegacyData {
  const merge = <T extends { id: string; updatedAt: string }>(a: T[], b: T[]) => {
    const map = new Map(a.map((record) => [record.id, record]))
    for (const record of b) {
      const old = map.get(record.id)
      if (!old || record.updatedAt >= old.updatedAt) map.set(record.id, record)
    }
    return [...map.values()]
  }
  const tombstones = new Map<string, LegacyData['deleted'][number]>()
  for (const tombstone of [...left.deleted, ...right.deleted]) {
    const key = `${tombstone.type}:${tombstone.id}`
    const old = tombstones.get(key)
    if (!old || tombstone.deletedAt > old.deletedAt) tombstones.set(key, tombstone)
  }
  const deleted = [...tombstones.values()]
  const shops = merge(left.shops, right.shops).filter((shop) =>
    !deleted.some((item) => item.type === 'shop' && item.id === shop.id && item.deletedAt >= shop.updatedAt))
  const visits = merge(left.visits, right.visits).filter((visit) =>
    !deleted.some((item) => item.type === 'visit' && item.id === visit.id && item.deletedAt >= visit.updatedAt))
  const rolledShops = shops.map((shop) => {
    const related = visits.filter((visit) => visit.shopId === shop.id)
    return { ...shop, visitCount: related.length, lastVisitedAt: related.map((visit) => visit.visitedAt).sort().at(-1) ?? null }
  })
  return { shops: rolledShops, visits, settings: right.settings, deleted, invalid: [...left.invalid, ...right.invalid] }
}
