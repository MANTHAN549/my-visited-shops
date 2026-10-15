import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Shop, Visit } from '@/types'
import { hasDataPassphrase, refreshLocalData, type AppData } from './localDataStore'

type LocalDataState = {
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
const LocalDataContext = createContext<LocalDataState | null>(null)

export function LocalDataProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<AppData>({ shops: [], visits: [], settings: {
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
    try { setPayload(await refreshLocalData()); setError(null); setUnlocked(hasDataPassphrase()) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load local data.') }
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
  return <LocalDataContext.Provider value={value}>{children}</LocalDataContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLocalData(): LocalDataState {
  const value = useContext(LocalDataContext)
  if (!value) throw new Error('useLocalData must be used inside LocalDataProvider.')
  return value
}
// eslint-disable-next-line react-refresh/only-export-components
export function useLocalShops() { const data = useLocalData(); return { shops: data.shops, loading: data.loading, saving: data.saving, error: data.error, refresh: data.refresh } }
// eslint-disable-next-line react-refresh/only-export-components
export function useLocalVisits() { const data = useLocalData(); return { visits: data.visits, loading: data.loading, saving: data.saving, error: data.error, refresh: data.refresh } }
