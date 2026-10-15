import type { Shop, ShopContact } from '@/types'
import { createId, haversineMeters, nowIso } from '@/utils/format'
import { addShop, deleteShop as deleteLocalShop, getShop, listShops, mergeAndSaveLocalData, refreshLocalData, updateShop as updateLocalShop } from './localDataStore'

export interface ShopInput {
  name: string
  category: string
  address: string
  latitude: number
  longitude: number
  primaryOwnerName: string
  primaryOwnerPhone: string
  contacts: ShopContact[]
  notes: string
  tags: string[]
  imageDataUrl?: string | null
}

function cleanContacts(contacts: ShopContact[]): ShopContact[] {
  return (contacts ?? []).filter((contact) => contact.name.trim() || contact.phone.trim()).map((contact) => ({
    ...contact,
    id: contact.id || createId('contact'),
    name: contact.name.trim(), phone: contact.phone.trim(),
    notes: contact.notes?.trim() || undefined,
  }))
}

export async function createShop(input: ShopInput): Promise<Shop> {
  const timestamp = nowIso()
  const shop: Shop = {
    id: createId('shop'), name: input.name.trim(), category: input.category.trim(),
    address: input.address.trim(), latitude: input.latitude, longitude: input.longitude,
    primaryOwnerName: input.primaryOwnerName.trim(), primaryOwnerPhone: input.primaryOwnerPhone.trim(),
    contacts: cleanContacts(input.contacts), notes: input.notes.trim(),
    tags: input.tags.map((tag) => tag.trim()).filter(Boolean), imageDataUrl: input.imageDataUrl ?? null,
    createdAt: timestamp, updatedAt: timestamp, lastVisitedAt: null, visitCount: 0,
  }
  return addShop(shop)
}

export async function updateShop(id: string, input: ShopInput): Promise<Shop> {
  const existing = await getShop(id)
  if (!existing) throw new Error('This shop no longer exists.')
  return updateLocalShop({
    ...existing, name: input.name.trim(), category: input.category.trim(), address: input.address.trim(),
    latitude: input.latitude, longitude: input.longitude, primaryOwnerName: input.primaryOwnerName.trim(),
    primaryOwnerPhone: input.primaryOwnerPhone.trim(), contacts: cleanContacts(input.contacts),
    notes: input.notes.trim(), tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
    imageDataUrl: input.imageDataUrl ?? null, updatedAt: nowIso(),
  })
}

export async function deleteShop(id: string, deleteVisits: boolean): Promise<void> {
  await deleteLocalShop(id, deleteVisits)
}
export async function countShops(): Promise<number> { return (await listShops()).length }
export async function putShops(shops: Shop[]): Promise<void> {
  const current = await refreshLocalData()
  await mergeAndSaveLocalData({ ...current, shops })
}
export { listShops, getShop }

export function matchesQuery(shop: Shop, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const content = [shop.name, shop.address, shop.category, shop.primaryOwnerName, shop.primaryOwnerPhone, shop.notes, ...shop.tags,
    ...shop.contacts.flatMap((contact) => [contact.name, contact.phone, contact.role ?? '', contact.notes ?? ''])].join('\n').toLowerCase()
  return q.split(/\s+/).every((term) => content.includes(term))
}
export function searchShops(shops: Shop[], query: string): Shop[] { return query.trim() ? shops.filter((shop) => matchesQuery(shop, query)) : shops }
export function findPossibleDuplicates(
  shops: Shop[],
  candidate: { name: string; primaryOwnerPhone: string; latitude: number; longitude: number },
  options: { proximityMeters?: number; excludeId?: string } = {},
): Array<{ shop: Shop; reason: string; distanceMeters?: number }> {
  const proximity = options.proximityMeters ?? 150
  const normalise = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  const targetName = normalise(candidate.name), targetPhone = candidate.primaryOwnerPhone.replace(/\D/g, '')
  const result: Array<{ shop: Shop; reason: string; distanceMeters?: number }> = []
  for (const shop of shops) {
    if (options.excludeId === shop.id) continue
    const name = normalise(shop.name), phone = shop.primaryOwnerPhone.replace(/\D/g, '')
    if (targetPhone && phone && targetPhone === phone) { result.push({ shop, reason: 'Same primary owner phone number' }); continue }
    if (targetName && name && (name === targetName || name.includes(targetName) || targetName.includes(name))) { result.push({ shop, reason: 'Very similar shop name' }); continue }
    const distance = haversineMeters(candidate, shop)
    if (distance <= proximity) result.push({ shop, reason: `Only ${Math.round(distance)} m from an existing shop`, distanceMeters: distance })
  }
  return result.slice(0, 5)
}
export function allTags(shops: Shop[]): string[] { return [...new Set(shops.flatMap((shop) => shop.tags))].sort((a, b) => a.localeCompare(b)) }
export function allCategories(shops: Shop[]): string[] { return [...new Set(shops.map((shop) => shop.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)) }
