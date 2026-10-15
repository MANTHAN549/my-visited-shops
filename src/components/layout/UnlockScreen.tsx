import { Lock, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/app/providers'
import { initializeLocalStore } from '@/services/localDataStore'
import { useLocalData } from '@/services/localDataContext'
import { Spinner } from '@/components/common'

/**
 * Full-screen unlock gate shown when the installation uses encrypted storage and
 * no key is currently held in memory.
 *
 * The password is only ever used to derive the AES key locally; it is never sent
 * anywhere and never stored.
 */
export function UnlockScreen() {
  const { refresh } = useLocalData()
  const { success, error: toastError } = useToast()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)

  async function handleUnlock(event: React.FormEvent) {
    event.preventDefault()
    if (!password || busy) return

    setBusy(true)
    setMessage(null)

    try {
      await initializeLocalStore(password)
      await refresh()

      setPassword('')
      success('Unlocked', 'Your shops and visit history are available.')
    } catch (err) {
      setAttempts((n) => n + 1)
      const text = (err as Error).message || 'Unable to unlock.'
      setMessage(text)
      toastError('Could not unlock', text)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-ink-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-lg">
            <Lock className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-ink-900">My Visited Shops is locked</h1>
          <p className="mt-1 text-sm text-ink-500">
            Your shop records and visit notes are encrypted in the local database file.
            Enter your data passphrase to decrypt them.
          </p>
        </div>

        <form onSubmit={handleUnlock} className="card p-5">
          <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">For a new data repository, set a passphrase with at least 12 characters. A forgotten passphrase cannot be recovered.</p>
          <label className="label" htmlFor="unlock-password">
            Data passphrase
          </label>
          <input
            id="unlock-password"
            type="password"
            className={`input ${message ? 'input-error' : ''}`}
            value={password}
            autoComplete="current-password"
            autoFocus
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Data passphrase"
          />

          {message && (
            <p className="error-text" role="alert">
              {message}
            </p>
          )}

          {attempts >= 2 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">Still locked?</p>
              <p className="mt-1">
                Passphrases are case sensitive. There is no recovery code; if it is forgotten,
                the encrypted records cannot be recovered. If you have an
                encrypted backup file, you can still restore it with the password you used when
                exporting it.
              </p>
            </div>
          )}

          <button type="submit" className="btn-primary mt-4 w-full" disabled={busy || !password}>
            {busy ? <Spinner className="text-white" /> : <ShieldCheck className="h-4 w-4" />}
            {busy ? 'Unlockingâ€¦' : 'Unlock'}
          </button>

          <p className="mt-3 text-center text-xs text-ink-400">
            Deriving the key with PBKDF2 can take a second or two on a phone.
          </p>
        </form>

        <p className="mt-4 text-center text-xs text-ink-400">
          The passphrase stays in memory only and is requested again when the app opens.
        </p>
      </div>
    </div>
  )
}

