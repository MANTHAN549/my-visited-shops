import { useEffect, useMemo, useState } from 'react'
import type { AppSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'
import { useGithubData, useGithubShops, useGithubVisits } from '@/services/githubDataContext'
import { getSettings } from '@/services/settingsService'
import { listVisitsWithShops } from '@/services/visitService'

let revision = 0
const listeners = new Set<() => void>()
export function bumpRevision(): void { revision += 1; listeners.forEach((listener) => listener()) }
export function useRevision(): number {
  const [, setValue] = useState(revision)
  useEffect(() => { const listener = () => setValue(revision); listeners.add(listener); return () => { listeners.delete(listener) } }, [])
  return revision
}
export function useShops() { const revision = useRevision(); const data = useGithubShops(); const refresh = data.refresh; useEffect(() => { if (revision) void refresh() }, [revision, refresh]); return { ...data, data: data.shops, locked: false, reload: refresh } }
export function useVisits() {
  const revision = useRevision()
  const data = useGithubVisits()
  const refresh = data.refresh
  const [withShops, setWithShops] = useState<Awaited<ReturnType<typeof listVisitsWithShops>>>([])
  useEffect(() => { if (revision) void refresh(); void listVisitsWithShops().then(setWithShops).catch(() => setWithShops([])) }, [data.visits, revision, refresh])
  return { ...data, data: withShops, locked: false, reload: refresh }
}
export function useSessionState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => { try { const saved = sessionStorage.getItem(key); return saved ? JSON.parse(saved) as T : initial } catch { return initial } })
  const update = (next: T) => { setValue(next); sessionStorage.setItem(key, JSON.stringify(next)) }
  return [value, update]
}
export function useSettings() {
  const { settings, refresh } = useGithubData()
  const [loaded, setLoaded] = useState<AppSettings>(DEFAULT_SETTINGS)
  useEffect(() => { setLoaded(settings) }, [settings])
  const update = async (patch: Partial<AppSettings>) => { const next = await (await import('@/services/settingsService')).saveSettings(patch); setLoaded(next); await refresh() }
  return { settings: loaded, loading: false, error: null, reload: async () => { setLoaded(await getSettings()); await refresh() }, update }
}
export function useEncryptionMeta() { return { meta: null, loading: false, reload: async () => undefined } }
export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => { const on = () => setOnline(true); const off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) } }, [])
  return online
}
export function useDebounced<T>(value: T, delay = 250): T {
  const [result, setResult] = useState(value)
  useEffect(() => { const timer = setTimeout(() => setResult(value), delay); return () => clearTimeout(timer) }, [value, delay])
  return result
}
export function useShop(id: string | undefined) {
  const { shops, loading, error, refresh } = useShops()
  const shop = shops.find((item) => item.id === id) ?? null
  return { shop, data: shop, loading, error, refresh, reload: refresh, locked: false }
}
export function useDashboardStats(shops: import('@/types').Shop[], visits: import('@/types').VisitWithShop[]) {
  return useMemo(() => ({ totalShops: shops.length, visitedShops: shops.filter((shop) => shop.visitCount > 0).length, neverVisitedShops: shops.filter((shop) => shop.visitCount === 0).length, totalVisits: visits.length, recentShops: [...shops].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,5), recentVisits: [...visits].sort((a,b) => b.visitedAt.localeCompare(a.visitedAt)).slice(0,5) }), [shops, visits])
}
