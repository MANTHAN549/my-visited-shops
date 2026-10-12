import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { AlertTriangle, Cloud, CloudOff, KeyRound, LogIn, LogOut, RefreshCw, ShieldCheck } from 'lucide-react'
import { db, openDatabase } from '@/database/db'
import { useOnlineStatus, useRevision } from '@/hooks'
import { supabaseConfigurationError } from '@/services/supabaseClient'
import { changeCloudPassphrase, clearCloudKey, createCloudKeyring, hasCloudKey, unlockCloudKeyring } from '@/services/cloudEncryptionService'
import type { CloudKeyring } from '@/services/cloudEncryptionService'
import { getCloudKeyring, getCurrentUser, listenForAuth, saveCloudKeyring, sendPasswordReset, signIn, signOut, signUp, updateAccountPassword } from '@/services/cloudAccountService'
import { acknowledgeInitialLocalData, resolveConflict, synchronize, type SyncConflict } from '@/services/cloudSyncService'
import { queueSync } from '@/services/syncQueueService'

type AuthMode = 'sign-in' | 'sign-up' | 'reset' | 'new-password'

/** Account, key management, and local-first cloud sync controls. */
export function CloudSyncPanel() {
  const online = useOnlineStatus()
  const revision = useRevision()
  const [user, setUser] = useState<User | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in')
  const [keyring, setKeyring] = useState<CloudKeyring | null>(null)
  const [configured, setConfigured] = useState(false)
  const [keyReady, setKeyReady] = useState(hasCloudKey())
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [recovery, setRecovery] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')
  const [recoveryReveal, setRecoveryReveal] = useState<string | null>(null)
  const [savedRecovery, setSavedRecovery] = useState(false)
  const [newCloudPassphrase, setNewCloudPassphrase] = useState('')
  const [pending, setPending] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])
  const [counts, setCounts] = useState({ uploaded: 0, downloaded: 0 })

  const refreshPending = useCallback(async () => {
    try { await openDatabase(); setPending(await db.syncQueue.count()) } catch { /* startup error is shown elsewhere */ }
  }, [])

  const loadKeyring = useCallback(async (nextUser: User | null) => {
    setUser(nextUser)
    setError(null)
    setMessage(null)
    setKeyring(null)
    setConfigured(false)
    clearCloudKey()
    setKeyReady(false)
    if (!nextUser) return
    try {
      const stored = await getCloudKeyring(nextUser.id)
      setKeyring(stored)
      setConfigured(true)
    } catch (err) { setError((err as Error).message) }
  }, [])

  useEffect(() => {
    if (supabaseConfigurationError) { setConfigured(false); return }
    let active = true
    void getCurrentUser().then((initial) => { if (active) void loadKeyring(initial) })
      .catch((err) => { if (active) setError((err as Error).message) })
    const unsubscribe = listenForAuth((next) => { if (active) void loadKeyring(next) })
    return () => { active = false; unsubscribe() }
  }, [loadKeyring])

  useEffect(() => { void refreshPending() }, [refreshPending, revision])

  const syncNow = useCallback(async () => {
    if (!user || !hasCloudKey()) return
    setBusy(true); setError(null); setMessage(null)
    try {
      const result = await acknowledgeInitialLocalData(user.id)
      setConflicts(result.conflicts)
      setCounts({ uploaded: result.uploaded, downloaded: result.downloaded })
      await refreshPending()
      if (result.conflicts.length) setMessage('Sync paused. Choose which copy to keep for each conflict.')
      else setMessage(`Sync complete. ${result.uploaded} uploaded, ${result.downloaded} downloaded.`)
    } catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }, [user, refreshPending])

  useEffect(() => {
    if (!user || !keyReady) return
    const trySync = () => {
      if (!navigator.onLine || busy) return
      void synchronize(user.id).then((result) => {
        setConflicts(result.conflicts)
        if (result.conflicts.length) setMessage('Sync paused. Review the conflict in Account & Cloud Sync.')
        void refreshPending()
      }).catch((err) => setError((err as Error).message))
    }
    window.addEventListener('cloud-sync-queued', trySync)
    window.addEventListener('online', trySync)
    return () => { window.removeEventListener('cloud-sync-queued', trySync); window.removeEventListener('online', trySync) }
  }, [user, keyReady, busy, refreshPending])

  async function authSubmit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null)
    try {
      if (authMode === 'new-password') {
        if (password.length < 8) throw new Error('Use at least 8 characters for your account password.')
        if (password !== password2) throw new Error('The account passwords do not match.')
        await updateAccountPassword(password)
        setPassword(''); setPassword2(''); setAuthMode('sign-in')
        setMessage('Account password updated.')
      } else if (authMode === 'reset') {
        if (!email.trim()) throw new Error('Enter your account email address.')
        await sendPasswordReset(email)
        setMessage('Password reset email sent. Open its link on this device to set a new account password.')
      } else {
        if (!email.trim()) throw new Error('Enter your account email address.')
        if (password.length < 8) throw new Error('Use at least 8 characters for your account password.')
        if (authMode === 'sign-up') {
          const result = await signUp(email, password)
          if (!result.session) setMessage('Check your email to confirm the account, then sign in here.')
          else await loadKeyring(result.user)
        } else {
          const result = await signIn(email, password)
          await loadKeyring(result.user)
        }
        setPassword('')
      }
    } catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  async function createEncryption() {
    if (password.length < 12) { setError('Use a cloud encryption passphrase with at least 12 characters.'); return }
    if (password !== password2) { setError('The cloud encryption passphrases do not match.'); return }
    if (!user) return
    setBusy(true); setError(null)
    try {
      const result = await createCloudKeyring(password)
      await saveCloudKeyring(user.id, result.keyring)
      setKeyring(result.keyring); setRecoveryReveal(result.recoveryCode); setPassword(''); setPassword2('')
      setMessage('Save the recovery code somewhere private. It is shown only once and is required if you forget the cloud encryption passphrase.')
    } catch (err) { clearCloudKey(); setError((err as Error).message) }
    finally { setBusy(false) }
  }

  async function unlockEncryption(event: React.FormEvent) {
    event.preventDefault()
    if (!keyring) return
    setBusy(true); setError(null)
    try {
      await unlockCloudKeyring(keyring, recovery ? recoveryCode.trim() : password, recovery)
      setKeyReady(true); setRecovery(false); setRecoveryCode(''); setPassword('')
      if (recovery) setMessage('Cloud data unlocked with recovery code. Set a new passphrase below to restore normal access.')
      else setMessage('Cloud encryption unlocked on this device.')
      if (!recovery) void syncNow()
    } catch { setError(recovery ? 'That recovery code could not unlock this account.' : 'That cloud encryption passphrase could not unlock this account.') }
    finally { setBusy(false) }
  }

  async function changePassphrase() {
    if (!user || !keyring) return
    setBusy(true); setError(null)
    try {
      const next = await changeCloudPassphrase(keyring, newCloudPassphrase)
      await saveCloudKeyring(user.id, next)
      setKeyring(next); setNewCloudPassphrase(''); setMessage('Cloud encryption passphrase updated. Keep the recovery code safe.')
    } catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  async function finishRecovery() {
    if (!newCloudPassphrase || !keyring || !user) return
    await changePassphrase()
  }

  async function handleSignOut() {
    setBusy(true); setError(null)
    try { await signOut(); clearCloudKey(); setKeyReady(false); setUser(null); setKeyring(null); setMessage('Signed out. Local records remain on this device.') }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  async function chooseConflict(conflict: SyncConflict, choice: 'local' | 'cloud') {
    if (!user) return
    setBusy(true); setError(null)
    try {
      await resolveConflict(user.id, conflict, choice)
      setConflicts((current) => current.filter((item) => item.id !== conflict.id))
      const result = await synchronize(user.id)
      setConflicts(result.conflicts); await refreshPending()
    } catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <section className="card p-4 lg:col-span-2" aria-labelledby="cloud-sync-title">
      <h2 id="cloud-sync-title" className="section-title"><Cloud className="h-4 w-4 text-brand-700" />Account &amp; cloud sync</h2>
      {supabaseConfigurationError ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{supabaseConfigurationError}</div>
      ) : !user ? (
        <>
          <p className="hint mt-2">Sign in to access your encrypted records on other devices. Local storage stays available offline.</p>
          <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(event) => void authSubmit(event)}>
            {authMode !== 'new-password' && <label className="text-sm font-medium text-ink-700">Email<input className="input mt-1" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>}
            {authMode !== 'reset' && <label className="text-sm font-medium text-ink-700">{authMode === 'new-password' ? 'New account password' : 'Account password'}<input className="input mt-1" type="password" autoComplete={authMode === 'sign-up' || authMode === 'new-password' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /></label>}
            {(authMode === 'sign-up' || authMode === 'new-password') && <label className="text-sm font-medium text-ink-700">Confirm password<input className="input mt-1" type="password" autoComplete="new-password" value={password2} onChange={(event) => setPassword2(event.target.value)} required minLength={8} /></label>}
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button className="btn-primary" disabled={busy}>{busy ? 'Please wait…' : authMode === 'sign-up' ? 'Create account' : authMode === 'reset' ? 'Send reset email' : authMode === 'new-password' ? 'Update password' : <><LogIn className="h-4 w-4" /> Sign in</>}</button>
              {authMode === 'sign-in' && <button type="button" className="btn-ghost" onClick={() => setAuthMode('sign-up')}>Create account</button>}
              {authMode === 'sign-in' && <button type="button" className="btn-ghost" onClick={() => setAuthMode('reset')}>Forgot password?</button>}
              {authMode !== 'sign-in' && <button type="button" className="btn-ghost" onClick={() => setAuthMode('sign-in')}>Back to sign in</button>}
            </div>
          </form>
        </>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200 p-3">
            <div><p className="text-sm font-semibold text-ink-800">{user.email}</p><p className="text-xs text-ink-500">{online ? 'Online' : 'Offline'} · {pending} pending change{pending === 1 ? '' : 's'}</p></div>
            <button type="button" className="btn-secondary btn-sm" onClick={() => void handleSignOut()} disabled={busy}><LogOut className="h-3.5 w-3.5" /> Sign out</button>
          </div>
          {!keyring ? (
            <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
              <h3 className="text-sm font-semibold text-brand-900">Set up cloud encryption</h3>
              <p className="mt-1 text-xs text-brand-800">This separate passphrase encrypts records before upload. Use it on each device; it is not your sign-in password or local app master password.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input className="input" aria-label="Cloud encryption passphrase" type="password" autoComplete="new-password" placeholder="Cloud encryption passphrase" value={password} onChange={(event) => setPassword(event.target.value)} />
                <input className="input" aria-label="Confirm cloud encryption passphrase" type="password" autoComplete="new-password" placeholder="Confirm passphrase" value={password2} onChange={(event) => setPassword2(event.target.value)} />
              </div>
              <button type="button" className="btn-primary mt-2" onClick={() => void createEncryption()} disabled={busy}><ShieldCheck className="h-4 w-4" /> Create encryption key</button>
            </div>
          ) : recoveryReveal ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" />Save your one-time recovery code</h3>
              <p className="mt-1 text-xs text-amber-900">This code can recover encrypted cloud data if the cloud passphrase is forgotten. The app cannot recreate it. Store it in a password manager or another secure place.</p>
              <code className="mt-2 block break-all rounded bg-white p-2 text-xs text-ink-900">{recoveryReveal}</code>
              <label className="mt-2 flex gap-2 text-xs text-amber-950"><input type="checkbox" checked={savedRecovery} onChange={(event) => setSavedRecovery(event.target.checked)} /> I saved this recovery code somewhere safe.</label>
              <button type="button" className="btn-primary mt-2" disabled={!savedRecovery || busy} onClick={() => { setRecoveryReveal(null); setSavedRecovery(false); setKeyReady(true); void syncNow() }}>Continue and sync</button>
            </div>
          ) : !keyReady ? (
            <form className="rounded-lg border border-ink-200 p-3" onSubmit={(event) => void unlockEncryption(event)}>
              <h3 className="text-sm font-semibold text-ink-800">Unlock cloud records</h3>
              <p className="mt-1 text-xs text-ink-500">The cloud encryption passphrase is separate from your account and local app passwords.</p>
              <input className="input mt-2" aria-label={recovery ? 'Recovery code' : 'Cloud encryption passphrase'} type="password" autoComplete="current-password" placeholder={recovery ? 'Recovery code' : 'Cloud encryption passphrase'} value={recovery ? recoveryCode : password} onChange={(event) => recovery ? setRecoveryCode(event.target.value) : setPassword(event.target.value)} required />
              <div className="mt-2 flex flex-wrap gap-2"><button className="btn-primary" disabled={busy}>{busy ? 'Unlocking…' : recovery ? 'Recover encryption key' : <><KeyRound className="h-4 w-4" /> Unlock and sync</>}</button><button type="button" className="btn-ghost" onClick={() => setRecovery((value) => !value)}>{recovery ? 'Use passphrase' : 'Use recovery code'}</button></div>
              {recovery && <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><input className="input" aria-label="New cloud encryption passphrase" type="password" placeholder="Set a new passphrase after recovery" value={newCloudPassphrase} onChange={(event) => setNewCloudPassphrase(event.target.value)} /><button type="button" className="btn-secondary" onClick={() => void finishRecovery()} disabled={busy || !keyReady}>Save new passphrase</button></div>}
            </form>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><ShieldCheck className="h-4 w-4" /> Cloud encryption is unlocked on this device.<button type="button" className="btn-ghost ml-auto" onClick={() => { clearCloudKey(); setKeyReady(false); setMessage('Cloud encryption locked on this device.') }}>Lock cloud key</button></div>
              <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" onClick={() => void syncNow()} disabled={busy || !online}><RefreshCw className="h-4 w-4" />{busy ? 'Syncing…' : 'Sync now'}</button><div className="flex items-center gap-1 text-xs text-ink-500">{online ? <Cloud className="h-4 w-4 text-emerald-700" /> : <CloudOff className="h-4 w-4" />}{online ? pending ? 'Pending changes' : 'Online' : 'Offline · changes stay on this device'}</div></div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><input className="input" type="password" autoComplete="new-password" aria-label="New cloud encryption passphrase" placeholder="New cloud encryption passphrase (12+ characters)" value={newCloudPassphrase} onChange={(event) => setNewCloudPassphrase(event.target.value)} /><button type="button" className="btn-secondary" disabled={busy || !newCloudPassphrase} onClick={() => void changePassphrase()}>Change passphrase</button></div>
              {counts.uploaded + counts.downloaded > 0 && <p className="text-xs text-ink-500">Last sync: {counts.uploaded} uploaded · {counts.downloaded} downloaded.</p>}
            </>
          )}
          {conflicts.length > 0 && <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3"><h3 className="text-sm font-semibold text-amber-950">Resolve sync conflicts</h3>{conflicts.map((conflict) => <div key={conflict.id} className="rounded border border-amber-200 bg-white p-2"><p className="text-xs text-ink-700">{conflict.entity} {conflict.recordId}: {conflict.reason}</p><div className="mt-2 flex gap-2"><button className="btn-secondary btn-sm" disabled={busy} onClick={() => void chooseConflict(conflict, 'local')}>Keep this device</button><button className="btn-secondary btn-sm" disabled={busy} onClick={() => void chooseConflict(conflict, 'cloud')}>Use cloud copy</button></div></div>)}</div>}
        </div>
      )}
      {message && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <p className="hint mt-3">Shop and visit content, including image data, is encrypted on this device before upload. Supabase receives ciphertext and account ownership metadata only. The account password never encrypts records. Lost cloud passphrase and recovery code means cloud data cannot be decrypted.</p>
    </section>
  )
}
