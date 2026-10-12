import { useEffect, useState } from 'react'
import { Download, RefreshCw, WifiOff, X } from 'lucide-react'
import { registerSW } from 'virtual:pwa-register'
import { useOnlineStatus } from '@/hooks'

/**
 * Registers the Service Worker and shows:
 *  - a persistent offline indicator (accurate: it uses navigator.onLine),
 *  - an update prompt when a new build has been downloaded.
 *
 * The Service Worker only ever caches static application assets. User records
 * live in IndexedDB and are never written into the SW cache.
 */
export function PwaController() {
  const online = useOnlineStatus()
  const [needRefresh, setNeedRefresh] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (import.meta.env.DEV) return
    try {
      const update = registerSW({
        immediate: true,
        onNeedRefresh() {
          setNeedRefresh(true)
        },
        onOfflineReady() {
          setOfflineReady(true)
          setTimeout(() => setOfflineReady(false), 6000)
        },
        onRegisteredSW(_swUrl, registration) {
          if (!registration) return
          // Check for a new build at most once an hour.
          setInterval(() => void registration.update(), 60 * 60 * 1000)
        },
      })
      setUpdateSW(() => update)
    } catch {
      // Service workers are unavailable (e.g. http on a LAN address). The app
      // still works; it simply will not be installable or offline capable.
    }
  }, [])

  return (
    <>
      {!online && (
        <div className="flex items-center justify-center gap-2 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900">
          <WifiOff className="h-3.5 w-3.5" />
          Offline — your saved shops and notes are still available. Maps and routing need a
          connection unless the tiles are already cached.
        </div>
      )}

      {offlineReady && (
        <div className="flex items-center justify-center gap-2 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
          <Download className="h-3.5 w-3.5" />
          Ready to work offline.
        </div>
      )}

      {needRefresh && !dismissed && (
        <div className="fixed inset-x-3 bottom-20 z-[1250] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-brand-200 bg-white p-3 shadow-[var(--shadow-lift)] md:bottom-4">
          <RefreshCw className="h-5 w-5 shrink-0 text-brand-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">A new version is available</p>
            <p className="text-xs text-ink-500">Reload to use the latest version.</p>
          </div>
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => void updateSW?.(true)}
          >
            Reload
          </button>
          <button
            type="button"
            className="icon-btn h-8 w-8"
            aria-label="Dismiss update notice"
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  )
}
