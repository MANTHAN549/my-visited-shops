import { Lock, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/app/providers'
import { getEncryptionMeta, saveEncryptionMeta } from '@/services/settingsService'
import { setSessionKey, unlockWithPassword } from '@/services/encryptionService'
import { Spinner } from '@/components/common'
import { bumpRevision } from '@/hooks'
import { useSession } from '@/app/providers'

/**
 * Full-screen unlock gate shown when the installation uses encrypted storage and
 * no key is currently held in memory.
 *
 * The password is only ever used to derive the AES key locally; it is never sent
 * anywhere and never stored.
 */
export function UnlockScreen() {
  const { markUnlocked } = useSession()
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
      const meta = await getEncryptionMeta()
      const key = await unlockWithPassword(password, meta)
      setSessionKey(key)
      // Sanity check that the key really works on this database before declaring
      // success: derive + verifier match is not the same as records decoding.
      const { canRead } = await import('@/services/shopService')
      if (!(await canRead())) throw new Error('Unlock failed.')

      // Refresh the stored verifier in case the row was written by an older build.
      if (!meta.verifier || !meta.verifierIv) {
        const { createVerifier } = await import('@/services/encryptionService')
        const { verifier, verifierIv } = await createVerifier(key)
        await saveEncryptionMeta({ ...meta, verifier, verifierIv })
      }

      setPassword('')
      success('Unlocked', 'Your shops and visit history are available.')
      bumpRevision()
      markUnlocked()
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
            Your shop records and visit notes are encrypted on this device. Enter your master
            password to decrypt them.
          </p>
        </div>

        <form onSubmit={handleUnlock} className="card p-5">
          <label className="label" htmlFor="unlock-password">
            Master password
          </label>
          <input
            id="unlock-password"
            type="password"
            className={`input ${message ? 'input-error' : ''}`}
            value={password}
            autoComplete="current-password"
            autoFocus
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Your master password"
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
                Passwords are case sensitive. There is no backdoor or recovery code — if the
                password is lost, the encrypted records cannot be recovered. If you have an
                encrypted backup file, you can still restore it with the password you used when
                exporting it.
              </p>
            </div>
          )}

          <button type="submit" className="btn-primary mt-4 w-full" disabled={busy || !password}>
            {busy ? <Spinner className="text-white" /> : <ShieldCheck className="h-4 w-4" />}
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>

          <p className="mt-3 text-center text-xs text-ink-400">
            Deriving the key with PBKDF2 can take a second or two on a phone.
          </p>
        </form>

        <p className="mt-4 text-center text-xs text-ink-400">
          Locking protects your data on a shared device. It is not a defence against malicious code
          running in this browser origin.
        </p>
      </div>
    </div>
  )
}
