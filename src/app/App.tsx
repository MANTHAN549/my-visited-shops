import { useEffect, useState } from 'react'
import { AppProviders } from '@/app/providers'
import { AppRoutes } from '@/app/router'
import { UnlockScreen } from '@/components/layout/UnlockScreen'
import { Spinner } from '@/components/common'
import { LocalDataProvider, useLocalData } from '@/services/localDataContext'

/**
 * Startup gate.
 *
 * The local file server is checked before the application opens. The passphrase
 * gate keeps encrypted records unavailable until they can be decrypted.
 */
function AppShell() {
  const { unlocked } = useLocalData()
  const [bootError, setBootError] = useState<string | null>(null)
  const [booted, setBooted] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        if (!cancelled) setBooted(true)
      } catch (error) {
        if (!cancelled) {
          setBootError(
            (error as Error)?.message ??
            'Could not initialize local storage.',
          )
        }
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  if (bootError) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-ink-50 p-4">
        <div className="card max-w-md p-5">
          <h1 className="text-lg font-semibold text-red-700">The app could not start</h1>
          <p className="mt-2 text-sm text-ink-600">{bootError}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-ink-500">
            <li>Turn off private / incognito browsing and reload.</li>
            <li>Allow the site to store data (site settings → cookies and site data).</li>
            <li>If you restored a database from a newer version, update the app first.</li>
          </ul>
          <button type="button" className="btn-primary mt-4" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }

  if (!booted) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center gap-3 bg-ink-50 text-sm text-ink-500">
        <Spinner />
        Starting My Visited Shops…
      </div>
    )
  }

  if (!unlocked) return <UnlockScreen />

  return <AppRoutes />
}

export default function App() {
  return (
    <AppProviders>
      <LocalDataProvider>
        <AppShell />
      </LocalDataProvider>
    </AppProviders>
  )
}
