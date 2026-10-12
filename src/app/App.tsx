import { useEffect, useState } from 'react'
import { AppProviders, useSession } from '@/app/providers'
import { AppRoutes } from '@/app/router'
import { UnlockScreen } from '@/components/layout/UnlockScreen'
import { Spinner } from '@/components/common'
import { assertSchemaCompatible } from '@/database/migrations'
import { db } from '@/database/db'
import { getEncryptionMeta } from '@/services/settingsService'
import { requestPersistentStorage } from '@/database/db'
import { setSessionKey } from '@/services/encryptionService'

/**
 * Startup gate.
 *
 * Order matters: the database is opened and its schema version checked before
 * anything reads or writes, then the encryption mode decides whether the unlock
 * screen or the application is shown. Any failure is reported with an actionable
 * message instead of a blank page.
 */
function AppShell() {
  const { ready, locked } = useSession()
  const [bootError, setBootError] = useState<string | null>(null)
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        await assertSchemaCompatible(db)

        // Best-effort: ask the browser to keep our data. A refusal is not fatal.
        void requestPersistentStorage()

        const meta = await getEncryptionMeta()

        // A brand new installation with encryption already configured (for
        // example a restored database) must start locked.
        if (meta.mode === 'encrypted') {
          setSessionKey(null)
        }

        if (!cancelled) setBooted(true)
      } catch (error) {
        if (!cancelled) {
          setBootError(
            (error as Error)?.message ??
              'The local database could not be opened. Private browsing mode or a blocked storage setting can cause this.',
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

  if (!booted || !ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center gap-3 bg-ink-50 text-sm text-ink-500">
        <Spinner />
        Starting My Visited Shops…
      </div>
    )
  }

  if (locked) return <UnlockScreen />

  return <AppRoutes />
}

export default function App() {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  )
}
