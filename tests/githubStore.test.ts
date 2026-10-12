import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addShop, getGithubConfig, initializeGithubStore, listShops, saveGithubConfig,
  setGithubPassphrase,
} from '@/services/githubStore'
import type { Shop } from '@/types'

const shop: Shop = {
  id: 'shop-1', name: '東京-магазин 🛍️', category: 'Grocery', address: '京都',
  latitude: 35.0116, longitude: 135.7681, primaryOwnerName: '', primaryOwnerPhone: '',
  contacts: [], notes: 'नमस्ते', tags: [], imageDataUrl: null,
  createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z',
  lastVisitedAt: null, visitCount: 0,
}

describe('GitHub storage', () => {
  let stored: Record<string, unknown> | null
  let sha: string
  let puts: number
  let conflictOnce: boolean

  beforeEach(() => {
    localStorage.clear()
    saveGithubConfig({ token: 'test-token', owner: 'owner', repo: 'data', branch: 'main' })
    setGithubPassphrase(null)
    stored = null
    sha = 'sha-1'
    puts = 0
    conflictOnce = false
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/repos/owner/data')) return new Response(JSON.stringify({ name: 'data' }), { status: 200 })
      const accept = new Headers(init?.headers).get('Accept')
      if (init?.method === 'PUT') {
        puts += 1
        if (conflictOnce) { conflictOnce = false; return new Response('', { status: 409 }) }
        const body = JSON.parse(String(init.body)) as { content: string }
        stored = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.content), (char) => char.charCodeAt(0)))) as Record<string, unknown>
        sha = `sha-${puts + 1}`
        return new Response(JSON.stringify({ content: { sha } }), { status: 200 })
      }
      if (!stored) return new Response('', { status: 404 })
      if (accept === 'application/vnd.github.raw+json') return new Response(JSON.stringify(stored), { status: 200 })
      return new Response(JSON.stringify({ sha }), { status: 200 })
    }))
  })

  it('creates data.json on first write and preserves Unicode through encrypted round trips', async () => {
    await initializeGithubStore('a strong passphrase for this test')
    await addShop(shop)
    expect(puts).toBe(2)
    setGithubPassphrase('a strong passphrase for this test')
    expect((await listShops())[0]?.name).toBe(shop.name)
    expect((await listShops())[0]?.notes).toBe(shop.notes)
    expect(getGithubConfig().token).toBe('test-token')
  })

  it('rejects data when the passphrase is wrong', async () => {
    await initializeGithubStore('correct passphrase')
    await addShop(shop)
    setGithubPassphrase('incorrect passphrase')
    await expect(listShops()).rejects.toThrow(/passphrase/i)
  })

  it('re-fetches and retries a SHA conflict with the queued change', async () => {
    await initializeGithubStore('a strong passphrase for this test')
    conflictOnce = true
    await addShop(shop)
    expect(puts).toBe(3)
    expect((await listShops()).map((item) => item.id)).toEqual([shop.id])
  })

  it('blocks writes while offline with an actionable message', async () => {
    await initializeGithubStore('a strong passphrase for this test')
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    try {
      await expect(addShop(shop)).rejects.toThrow(/offline/i)
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    }
  })
})
