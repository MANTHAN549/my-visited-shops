import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Shop, Visit } from '@/types'
import { refreshGithubData, type GithubPayload } from './githubStore'

type GithubDataState = {
  shops: Shop[]
  visits: Visit[]
  settings: import('@/types').AppSettings
  loading: boolean
  saving: boolean
  error: string | null
  refresh: () => Promise<void>
  setSaving: (saving: boolean) => void
  unlocked: boolean
}
const GithubDataContext = createContext<GithubDataState | null>(null)

export function GithubDataProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<GithubPayload>({ shops: [], visits: [], settings: {
    mapLayer: 'osm', reverseGeocodingEnabled: false, routingBaseUrl: 'https://router.project-osrm.org',
    routingProfile: 'driving', geocodingBaseUrl: 'https://nominatim.openstreetmap.org',
    autoLockMinutes: 15, mobileListFirst: true,
  }, deleted: [] })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const refresh = useCallback(async () => {
    setLoading(true)
    try { setPayload(await refreshGithubData()); setError(null); setUnlocked(true) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load GitHub data.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])
  const value = useMemo(() => ({
    shops: payload.shops, visits: payload.visits, settings: payload.settings, loading, saving, error, refresh, setSaving, unlocked,
  }), [payload, loading, saving, error, refresh, unlocked])
  return <GithubDataContext.Provider value={value}>{children}</GithubDataContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useGithubData(): GithubDataState {
  const value = useContext(GithubDataContext)
  if (!value) throw new Error('useGithubData must be used inside GithubDataProvider.')
  return value
}
// eslint-disable-next-line react-refresh/only-export-components
export function useGithubShops() { const data = useGithubData(); return { shops: data.shops, loading: data.loading, saving: data.saving, error: data.error, refresh: data.refresh } }
// eslint-disable-next-line react-refresh/only-export-components
export function useGithubVisits() { const data = useGithubData(); return { visits: data.visits, loading: data.loading, saving: data.saving, error: data.error, refresh: data.refresh } }
