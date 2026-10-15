import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addShop, initializeLocalStore, listShops, setDataPassphrase,
  updateShop, deleteShop, addVisit, listVisits,
} from '@/services/localDataStore'
import { listVisitsForShop } from '@/services/visitService'
import type { Shop } from '@/types'

const shop: Shop = {
  id: 'shop-1', name: '東京-магазин 🛍️', category: 'Grocery', address: '京都',
  latitude: 35.0116, longitude: 135.7681, primaryOwnerName: '', primaryOwnerPhone: '',
  contacts: [], notes: 'नमस्ते', tags: [], imageDataUrl: null,
  createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z',
  lastVisitedAt: null, visitCount: 0,
}

describe('local JSON storage', () => {
  let stored: Record<string, unknown> | null
  let revision: string | null
  let puts: number
  let conflictOnce: boolean

  beforeEach(() => {
    localStorage.clear()
    setDataPassphrase(null)
    stored = null
    revision = null
    puts = 0
    conflictOnce = false
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== '/api/database') return new Response('', { status: 404 })
      if (init?.method === 'PUT') {
        puts += 1
        if (conflictOnce) { conflictOnce = false; return new Response('', { status: 409 }) }
        const body = JSON.parse(String(init.body)) as { document: Record<string, unknown>; expectedRevision: string | null }
        if (body.expectedRevision !== revision) return new Response('', { status: 409 })
        stored = body.document
        revision = `revision-${puts}`
        return new Response(JSON.stringify({ revision }), { status: 200 })
      }
      return new Response(JSON.stringify({ document: stored, revision }), { status: 200 })
    }))
  })

  it('creates database/data.json on first write and preserves Unicode through encrypted round trips', async () => {
    await initializeLocalStore('a strong passphrase for this test')
    await addShop(shop)
    expect(puts).toBe(2)
    setDataPassphrase('a strong passphrase for this test')
    expect((await listShops())[0]?.name).toBe(shop.name)
    expect((await listShops())[0]?.notes).toBe(shop.notes)
  })

  it('rejects data when the passphrase is wrong', async () => {
    await initializeLocalStore('correct passphrase')
    await addShop(shop)
    setDataPassphrase('incorrect passphrase')
    await expect(listShops()).rejects.toThrow(/passphrase/i)
  })

  it('re-fetches and retries a revision conflict with the queued change', async () => {
    await initializeLocalStore('a strong passphrase for this test')
    conflictOnce = true
    await addShop(shop)
    expect(puts).toBe(3)
    expect((await listShops()).map((item) => item.id)).toEqual([shop.id])
  })

  it('blocks writes while offline with an actionable message', async () => {
    await initializeLocalStore('a strong passphrase for this test')
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    try {
      await expect(addShop(shop)).rejects.toThrow(/offline/i)
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    }
  })

  it('keeps the newest same-id edit and records deletes as tombstones', async () => {
    await initializeLocalStore('a strong passphrase for this test')
    await addShop(shop)
    await updateShop({ ...shop, name: 'newer shop', updatedAt: '2026-10-14T00:00:00.000Z' })
    await updateShop({ ...shop, name: 'stale shop', updatedAt: '2026-10-12T00:00:00.000Z' })
    expect((await listShops())[0]?.name).toBe('newer shop')
    await deleteShop(shop.id)
    await addShop(shop)
    expect(await listShops()).toEqual([])
  })

  it('recalculates visit rollups and retains orphan visits', async () => {
    await initializeLocalStore('a strong passphrase for this test')
    await addShop(shop)
    await addVisit({ id: 'visit-1', shopId: shop.id, visitedAt: '2026-10-14T12:00:00.000Z', note: '', purpose: '', amountSpent: '', createdAt: '2026-10-14T12:00:00.000Z', updatedAt: '2026-10-14T12:00:00.000Z' })
    await addVisit({ id: 'orphan-visit', shopId: 'missing-shop', visitedAt: '2026-10-14T13:00:00.000Z', note: 'keep me', purpose: '', amountSpent: '', createdAt: '2026-10-14T13:00:00.000Z', updatedAt: '2026-10-14T13:00:00.000Z' })
    expect((await listShops())[0]).toMatchObject({ visitCount: 1, lastVisitedAt: '2026-10-14T12:00:00.000Z' })
    expect((await listVisits()).map((visit) => visit.id)).toContain('orphan-visit')
    expect(await listVisitsForShop('missing-shop')).toHaveLength(1)
  })

  it('rejects an invalid downloaded document and uses raw downloads for large records', async () => {
    await initializeLocalStore('a strong passphrase for this test')
    stored = { version: 99 }
    await expect(listShops()).rejects.toThrow(/invalid format/i)
    stored = null
    revision = null
    await initializeLocalStore('a strong passphrase for this test')
    await addShop({ ...shop, notes: 'x'.repeat(1_100_000) })
    expect((await listShops())[0]?.notes).toHaveLength(1_100_000)
  })
})
