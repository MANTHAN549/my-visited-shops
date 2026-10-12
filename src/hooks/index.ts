/**
 * React hooks that connect the UI to IndexedDB.
 *
 * `useShops` and `useVisits` deliberately re-read from the database whenever the
 * `revision` counter changes. That counter is bumped by every write, which keeps
 * the dashboard markers, lists and statistics consistent without a global state
 * library, and works identically for encrypted and plain storage.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, Shop, Visit, VisitWithShop } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'
import { listShops, LockedError } from '@/services/shopService'
import { listVisitsWithShops } from '@/services/visitService'
import { getEncryptionMeta, getSettings, saveSettings as persistSettings } from '@/services/settingsService'
import type { EncryptionMeta } from '@/types'

/* ------------------------------------------------------------------ */
/* Global revision counter                                            */
/* ------------------------------------------------------------------ */

let revision = 0
const listeners = new Set<() => void>()

/** Call after any write so every mounted data hook refreshes. */
export function bumpRevision(): void {
  revision += 1
  for (const listener of listeners) listener()
}

export function useRevision(): number {
  const [value, setValue] = useState(revision)
  useEffect(() => {
    const listener = () => setValue(revision)
    listeners.add(listener)
    // Catch up in case a write happened between render and subscribe.
    listener()
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return value
}

/* ------------------------------------------------------------------ */
/* Generic async loader                                               */
/* ------------------------------------------------------------------ */

interface AsyncState<T> {
  data: T
  loading: boolean
  error: string | null
  locked: boolean
  reload: () => void
}

function useAsyncData<T>(loader: () => Promise<T>, initial: T, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [nonce, setNonce] = useState(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    loader()
      .then((result) => {
        if (cancelled || !mounted.current) return
        setData(result)
        setLocked(false)
      })
      .catch((err: unknown) => {
        if (cancelled || !mounted.current) return
        if (err instanceof LockedError || (err as Error)?.name === 'LockedError') {
          setLocked(true)
          setError(null)
        } else {
          setError((err as Error)?.message ?? 'Something went wrong while reading local data.')
        }
      })
      .finally(() => {
        if (!cancelled && mounted.current) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { data, loading, error, locked, reload }
}

/* ------------------------------------------------------------------ */
/* Shops                                                              */
/* ------------------------------------------------------------------ */

export function useShops(): AsyncState<Shop[]> & { shops: Shop[] } {
  const rev = useRevision()
  const state = useAsyncData<Shop[]>(() => listShops(), [], [rev])
  return { ...state, shops: state.data }
}

export function useShop(id: string | undefined): AsyncState<Shop | null> {
  const rev = useRevision()
  const state = useAsyncData<Shop | null>(
    async () => {
      if (!id) return null
      const { getShop } = await import('@/services/shopService')
      return getShop(id)
    },
    null,
    [id, rev],
  )
  return state
}

/* ------------------------------------------------------------------ */
/* Visits                                                             */
/* ------------------------------------------------------------------ */

export function useVisits(): AsyncState<VisitWithShop[]> {
  const rev = useRevision()
  return useAsyncData<VisitWithShop[]>(() => listVisitsWithShops(), [], [rev])
}

/* ------------------------------------------------------------------ */
/* Settings                                                           */
/* ------------------------------------------------------------------ */

export function useSettings(): {
  settings: AppSettings
  loading: boolean
  update: (patch: Partial<AppSettings>) => Promise<void>
} {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getSettings()
      .then((value) => {
        if (!cancelled) setSettings(value)
      })
      .catch(() => {
        /* defaults already applied */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await persistSettings(patch)
    setSettings(next)
  }, [])

  return { settings, loading, update }
}

/* ------------------------------------------------------------------ */
/* Encryption metadata                                                */
/* ------------------------------------------------------------------ */

export function useEncryptionMeta(): { meta: EncryptionMeta | null; loading: boolean; reload: () => void } {
  const [meta, setMeta] = useState<EncryptionMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getEncryptionMeta()
      .then((value) => {
        if (!cancelled) setMeta(value)
      })
      .catch(() => {
        if (!cancelled) setMeta({ mode: 'none', createdAt: new Date().toISOString(), version: 1 })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [nonce])

  return { meta, loading, reload: () => setNonce((n) => n + 1) }
}

/* ------------------------------------------------------------------ */
/* Misc                                                               */
/* ------------------------------------------------------------------ */

/** Debounce any fast changing value (search boxes). */
export function useDebounced<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** Track online / offline so the UI can show an accurate indicator. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])
  return online
}

/** Persist UI filter state in sessionStorage so it survives navigation. */
export function useSessionState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })

  const update = useCallback(
    (next: T) => {
      setValue(next)
      try {
        sessionStorage.setItem(key, JSON.stringify(next))
      } catch {
        /* storage full or blocked - filters simply will not persist */
      }
    },
    [key],
  )

  return [value, update]
}

/** Confirm-before-leaving guard for forms with unsaved changes. */
export function useUnsavedChangesWarning(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [enabled])
}

/** Compute dashboard statistics from already-loaded data. */
export function useDashboardStats(shops: Shop[], visits: Visit[]) {
  return useMemo(() => {
    const visited = shops.filter((shop) => (shop.visitCount ?? 0) > 0 || shop.lastVisitedAt)
    return {
      totalShops: shops.length,
      visitedShops: visited.length,
      neverVisitedShops: shops.length - visited.length,
      totalVisits: visits.length,
    }
  }, [shops, visits])
}
