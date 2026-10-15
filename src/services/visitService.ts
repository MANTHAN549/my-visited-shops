import type { Visit, VisitWithShop } from '@/types'
import { createId, nowIso, toDateKey } from '@/utils/format'
import { addVisit, deleteVisit as deleteGithubVisit, getVisit, listVisits, searchVisits, updateVisit as updateGithubVisit, refreshGithubData } from './githubStore'
import { getShop, listShops } from './shopService'

export interface VisitInput { shopId: string; visitedAt: string; note: string; purpose: string; amountSpent: string }

export async function getVisitWithShop(id: string): Promise<VisitWithShop | null> {
  const visit = await getVisit(id)
  if (!visit) return null
  return { ...visit, shop: await getShop(visit.shopId) }
}
export async function listVisitsForShop(shopId: string): Promise<Visit[]> {
  return (await listVisits()).filter((visit) => visit.shopId === shopId).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))
}
export async function listVisitsWithShops(): Promise<VisitWithShop[]> {
  const [visits, shops] = await Promise.all([listVisits(), listShops()])
  const byId = new Map(shops.map((shop) => [shop.id, shop]))
  return visits.map((visit) => ({ ...visit, shop: byId.get(visit.shopId) ?? null }))
}
export async function countVisits(): Promise<number> { return (await listVisits()).length }
export async function createVisit(input: VisitInput): Promise<Visit> {
  if (!await getShop(input.shopId)) throw new Error('The shop for this visit no longer exists.')
  const timestamp = nowIso()
  return addVisit({
    id: createId('visit'), shopId: input.shopId, visitedAt: input.visitedAt || timestamp,
    note: input.note.trim(), purpose: input.purpose.trim(), amountSpent: input.amountSpent.trim(),
    createdAt: timestamp, updatedAt: timestamp,
  })
}
export async function updateVisit(id: string, patch: Partial<Pick<Visit, 'note' | 'purpose' | 'amountSpent' | 'visitedAt'>>): Promise<Visit> {
  const existing = await getVisit(id)
  if (!existing) throw new Error('This visit record no longer exists.')
  return updateGithubVisit({
    ...existing,
    note: patch.note?.trim() ?? existing.note,
    purpose: patch.purpose?.trim() ?? existing.purpose,
    amountSpent: patch.amountSpent?.trim() ?? existing.amountSpent,
    visitedAt: patch.visitedAt ?? existing.visitedAt,
    updatedAt: nowIso(),
  })
}
export async function deleteVisit(id: string): Promise<void> { await deleteGithubVisit(id) }
export async function deleteVisitsForShop(shopId: string): Promise<number> {
  const related = await listVisitsForShop(shopId)
  await Promise.all(related.map((visit) => deleteGithubVisit(visit.id)))
  return related.length
}
export async function putVisits(visits: Visit[]): Promise<void> {
  const current = await refreshGithubData()
  await Promise.all(visits.map((visit) => addVisit(visit)))
  if (!visits.length) return
  void current
}
export async function recomputeShopRollup(_shopId: string): Promise<void> { await refreshGithubData() }
export async function recomputeAllRollups(): Promise<void> { await refreshGithubData() }

export interface VisitFilters { query: string; shopId: string; from: string; to: string }
export function filterVisits(visits: VisitWithShop[], filters: VisitFilters): VisitWithShop[] {
  const terms = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const fromTs = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : null
  const toTs = filters.to ? new Date(`${filters.to}T23:59:59.999`).getTime() : null
  return visits.filter((visit) => {
    if (filters.shopId && visit.shopId !== filters.shopId) return false
    const timestamp = new Date(visit.visitedAt).getTime()
    if (fromTs !== null && timestamp < fromTs) return false
    if (toTs !== null && timestamp > toTs) return false
    const text = [visit.shop?.name ?? '', visit.shop?.address ?? '', visit.note, visit.purpose, visit.amountSpent].join('\n').toLowerCase()
    return terms.every((term) => text.includes(term))
  })
}
export function sortVisits(visits: VisitWithShop[], direction: 'newest' | 'oldest'): VisitWithShop[] {
  const ordered = [...visits].sort((a, b) => a.visitedAt.localeCompare(b.visitedAt))
  return direction === 'newest' ? ordered.reverse() : ordered
}
export function groupVisitsByDate(visits: VisitWithShop[]): Array<{ date: string; visits: VisitWithShop[] }> {
  const groups = new Map<string, VisitWithShop[]>()
  for (const visit of visits) groups.set(toDateKey(visit.visitedAt), [...(groups.get(toDateKey(visit.visitedAt)) ?? []), visit])
  return [...groups.entries()].map(([date, items]) => ({ date, visits: items }))
}
export function groupVisitsByShop(visits: VisitWithShop[]): Array<{ shopId: string; shopName: string; visits: VisitWithShop[] }> {
  const groups = new Map<string, VisitWithShop[]>()
  for (const visit of visits) groups.set(visit.shopId, [...(groups.get(visit.shopId) ?? []), visit])
  return [...groups.entries()].map(([shopId, items]) => ({
    shopId, shopName: items[0]?.shop?.name ?? 'Unknown shop',
    visits: [...items].sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)),
  })).sort((a, b) => a.shopName.localeCompare(b.shopName))
}
export function totalSpent(visits: Visit[]): number {
  return visits.reduce((sum, visit) => {
    const amount = Number(visit.amountSpent.replace(/[^\d.-]/g, ''))
    return Number.isFinite(amount) ? sum + amount : sum
  }, 0)
}
export { listVisits, searchVisits }
