import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  Database,
  Download,
  HardDrive,
  Info,
  KeyRound,
  Lock,
  LockOpen,
  Map as MapIcon,
  Navigation,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  Unlock,
} from 'lucide-react'
import { DataState, PageHeader, Spinner } from '@/components/common'
import { useConfirm, useSession, useToast } from '@/app/providers'
import { useEncryptionMeta, useSettings, useShops, useVisits } from '@/hooks'
import { bumpRevision } from '@/hooks'
import {
  changeMasterPassword,
  disableEncryption,
  enableEncryption,
  passwordStrength,
  MIN_PASSWORD_LENGTH,
} from '@/services/securityService'
import { destroyDatabase, requestPersistentStorage, storageEstimate } from '@/database/db'
import { formatBytes } from '@/utils/image'
import { pluralize } from '@/utils/format'
import { resetAllCaches } from '@/utils/maintenance'

/** Settings & Security: encryption, locking, storage, map/routing providers. */
export default function SettingsPage() {
  const { success, error: toastError, warning, info } = useToast()
  const confirm = useConfirm()
  const { lockNow, locked, markUnlocked } = useSession()

  const { meta, loading: metaLoading, reload: reloadMeta } = useEncryptionMeta()
  const { settings, update: updateSettings, loading: settingsLoading } = useSettings()
  const { shops, loading, error, reload } = useShops()
  const { data: visits } = useVisits()

  /* ------------------------------ encryption ------------------------------ */
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  /* -------------------------------- storage -------------------------------- */
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)

  /* -------------------------------- install -------------------------------- */
  const [installEvent, setInstallEvent] = useState<Event | null>(null)
  const [installed, setInstalled] = useState(
    typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches,
  )

  useEffect(() => {
    void storageEstimate().then(setEstimate)
    if (navigator.storage?.persisted) {
      void navigator.storage.persisted().then(setPersisted)
    }
  }, [shops.length, visits?.length])

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event)
    }
    const onInstalled = () => {
      setInstalled(true)
      setInstallEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const strength = useMemo(() => passwordStrength(password), [password])
  const newStrength = useMemo(() => passwordStrength(newPassword), [newPassword])

  const encryptionEnabled = meta?.mode === 'encrypted'

  /* ------------------------------- handlers ------------------------------- */

  async function handleEnableEncryption() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      warning('Password too short', `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (password !== password2) {
      warning('Passwords do not match', 'Type the same master password twice.')
      return
    }

    const answer = await confirm({
      title: 'Enable encrypted storage?',
      message:
        `All ${pluralize(shops.length, 'shop')} and ${pluralize(visits?.length ?? 0, 'visit record')} on this device will be re-encrypted with AES-GCM.\n\n` +
        'You will need this master password every time you unlock the app.\n\n' +
        'Important: there is no recovery code. If you forget the password, the encrypted records cannot be recovered — ' +
        'only a separate encrypted backup file, made with a password you remember, can be restored.',
      confirmLabel: 'Enable encryption',
    })
    if (!answer.confirmed) return

    setBusy('enable')
    try {
      await enableEncryption(password)
      setPassword('')
      setPassword2('')
      reloadMeta()
      bumpRevision()
      markUnlocked()
      success('Encryption enabled', 'Your records are now stored encrypted on this device.')
    } catch (err) {
      toastError('Could not enable encryption', (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function handleDisableEncryption() {
    if (!currentPassword) {
      warning('Enter your master password', 'Your current password is required to turn encryption off.')
      return
    }

    const answer = await confirm({
      title: 'Turn off encryption?',
      message:
        'Every record will be rewritten as plain JSON inside IndexedDB.\n\n' +
        'Anyone who can open developer tools on this device will then be able to read your shop names, phone numbers, ' +
        'coordinates and visit notes. This cannot be undone automatically — you can turn encryption back on later.',
      confirmLabel: 'Turn off encryption',
      tone: 'danger',
    })
    if (!answer.confirmed) return

    setBusy('disable')
    try {
      await disableEncryption(currentPassword)
      setCurrentPassword('')
      reloadMeta()
      bumpRevision()
      info('Encryption turned off', 'Records are now stored as plain JSON in this browser.')
    } catch (err) {
      toastError('Could not turn off encryption', (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function handleChangePassword() {
    if (!currentPassword) {
      warning('Enter your current password')
      return
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      warning('New password too short', `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (newPassword !== newPassword2) {
      warning('New passwords do not match')
      return
    }

    setBusy('change')
    try {
      await changeMasterPassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setNewPassword2('')
      reloadMeta()
      success('Master password changed', 'All records were re-encrypted with the new key.')
    } catch (err) {
      toastError('Could not change the password', (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function handleRequestPersistence() {
    const granted = await requestPersistentStorage()
    setPersisted(granted)
    if (granted) success('Persistent storage granted', 'The browser will be less likely to clear your data.')
    else
      warning(
        'Persistent storage not granted',
        'The browser may clear local data when storage runs low. Keep regular backups.',
      )
  }

  async function handleEraseEverything() {
    const typed = await confirm({
      title: 'Erase all local data?',
      message:
        `This deletes all ${pluralize(shops.length, 'shop')} and ${pluralize(visits?.length ?? 0, 'visit record')} from this browser, ` +
        'and removes the encryption configuration.\n\n' +
        'This cannot be undone. If you have not exported a backup, the data is gone for good.',
      confirmLabel: 'I understand, continue',
      tone: 'danger',
    })
    if (!typed.confirmed) return

    const final = await confirm({
      title: 'Last chance',
      message: 'Delete everything now? There is no undo and no recycle bin.',
      confirmLabel: 'Erase everything',
      tone: 'danger',
    })
    if (!final.confirmed) return

    setBusy('erase')
    try {
      await destroyDatabase()
      await resetAllCaches()
      reloadMeta()
      bumpRevision()
      success('All local data erased', 'The application is back to a clean state.')
      setTimeout(() => window.location.reload(), 800)
    } catch (err) {
      toastError('Could not erase the data', (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function handleInstall() {
    if (!installEvent) return
    const prompt = installEvent as Event & { prompt?: () => Promise<void> }
    await prompt.prompt?.()
    setInstallEvent(null)
  }

  return (
    <>
      <PageHeader
        title="Settings &amp; Security"
        description="Encryption, locking, map and routing providers, and local storage."
        icon={<ShieldCheck className="h-5 w-5 text-brand-700" />}
        actions={
          <Link to="/backup" className="btn-secondary">
            <Download className="h-4 w-4" />
            Backup &amp; restore
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ------------------------------ Encryption ------------------------------ */}
        <section className="card p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">
              <Lock className="h-4 w-4 text-brand-700" />
              Encryption &amp; application lock
            </h2>

            <span className={encryptionEnabled ? 'badge-brand' : 'badge-neutral'}>
              {metaLoading ? 'Checking…' : encryptionEnabled ? 'Encrypted (AES-GCM)' : 'Not encrypted'}
            </span>
          </div>

          <p className="mt-2 text-sm text-ink-600">
            When encryption is on, the contents of every shop and visit record are encrypted with
            AES-GCM using a key derived from your master password with PBKDF2-SHA256 (at least{' '}
            {meta?.iterations?.toLocaleString() ?? '600,000'} iterations and a unique random salt). A
            fresh random IV is generated for every single encryption. Only non-sensitive index fields
            (record id, shop id, timestamps, visit count) stay readable so the database can sort and
            filter; text search runs in memory after decryption.
          </p>

          {encryptionEnabled ? (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 p-3">
                <span className="text-sm text-ink-700">
                  Status: {locked ? 'Locked — records are not readable' : 'Unlocked for this session'}
                </span>
                {!locked && (
                  <button type="button" className="btn-secondary btn-sm ml-auto" onClick={lockNow}>
                    <Lock className="h-3.5 w-3.5" />
                    Lock Now
                  </button>
                )}
              </div>

              <div className="rounded-lg border border-ink-200 p-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-800">
                  <KeyRound className="h-4 w-4 text-brand-700" />
                  Change master password
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="label" htmlFor="current-password">
                      Current password
                    </label>
                    <input
                      id="current-password"
                      type="password"
                      className="input"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="new-password">
                      New password
                    </label>
                    <input
                      id="new-password"
                      type="password"
                      className="input"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="new-password-2">
                      Repeat new password
                    </label>
                    <input
                      id="new-password-2"
                      type="password"
                      className="input"
                      autoComplete="new-password"
                      value={newPassword2}
                      onChange={(event) => setNewPassword2(event.target.value)}
                    />
                  </div>
                </div>

                {newPassword && (
                  <p className="mt-2 text-xs text-ink-500">
                    Strength: <strong>{newStrength.label}</strong> — {newStrength.advice}
                  </p>
                )}

                <button
                  type="button"
                  className="btn-primary mt-3"
                  onClick={handleChangePassword}
                  disabled={busy === 'change'}
                >
                  {busy === 'change' ? <Spinner className="text-white" /> : <RefreshCw className="h-4 w-4" />}
                  Change master password
                </button>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                  <LockOpen className="h-4 w-4" />
                  Turn off encryption
                </h3>
                <p className="mt-1 text-xs text-amber-900">
                  Records would be rewritten as plain JSON inside IndexedDB. Anyone with access to this
                  browser profile could then read them.
                </p>
                <button
                  type="button"
                  className="btn-secondary btn-sm mt-2"
                  onClick={handleDisableEncryption}
                  disabled={busy === 'disable'}
                >
                  {busy === 'disable' ? <Spinner /> : <Unlock className="h-3.5 w-3.5" />}
                  Turn off encryption
                </button>
              </div>

              <div className="rounded-lg border border-ink-200 p-3">
                <h3 className="text-sm font-semibold text-ink-800">Auto lock</h3>
                <p className="mt-1 text-xs text-ink-500">
                  The key is dropped from memory after this much inactivity. The records stay
                  encrypted; you simply need to unlock again.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[0, 5, 15, 30, 60].map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      className={`chip ${settings.autoLockMinutes === minutes ? 'chip-active' : ''}`}
                      onClick={() => void updateSettings({ autoLockMinutes: minutes })}
                    >
                      {minutes === 0 ? 'Never' : `${minutes} min`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-ink-200 bg-ink-50 p-3 text-xs text-ink-600">
                <p className="font-semibold text-ink-700">What encryption does and does not do</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4">
                  <li>Protects the stored records if someone reads the IndexedDB database directly.</li>
                  <li>Protects an exported encrypted backup file, including in transit.</li>
                  <li>
                    Does <strong>not</strong> protect you against malicious scripts running in this
                    origin while the app is unlocked — JavaScript cannot guarantee memory erasure.
                  </li>
                  <li>There is no hidden default password and no backdoor.</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="master-password">
                    Create a master password
                  </label>
                  <input
                    id="master-password"
                    type="password"
                    className="input"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="master-password-2">
                    Repeat master password
                  </label>
                  <input
                    id="master-password-2"
                    type="password"
                    className="input"
                    autoComplete="new-password"
                    value={password2}
                    onChange={(event) => setPassword2(event.target.value)}
                  />
                </div>
              </div>

              {password && (
                <p className="text-xs text-ink-500">
                  Strength: <strong>{strength.label}</strong> — {strength.advice}
                </p>
              )}

              <button
                type="button"
                className="btn-primary"
                onClick={handleEnableEncryption}
                disabled={busy === 'enable'}
              >
                {busy === 'enable' ? <Spinner className="text-white" /> : <ShieldCheck className="h-4 w-4" />}
                Enable encrypted storage
              </button>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Losing the master password means losing the data
                </p>
                <p className="mt-1">
                  No recovery code is generated and none is stored. Write the password down somewhere
                  safe, or keep a separate encrypted backup whose password you remember.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* ------------------------------- Map & routing ------------------------------- */}
        <section className="card p-4">
          <h2 className="section-title">
            <MapIcon className="h-4 w-4 text-brand-700" />
            Map &amp; routing
          </h2>

          <DataState loading={settingsLoading} error={null}>
            <div className="mt-3 space-y-4">
              <div>
                <span className="label">Map tiles</span>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { value: 'osm', label: 'OpenStreetMap (standard)' },
                      { value: 'topo', label: 'OpenTopoMap (terrain)' },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`chip ${settings.mapLayer === option.value ? 'chip-active' : ''}`}
                      onClick={() => void updateSettings({ mapLayer: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="hint">
                  Tiles are fetched from the tile server you select. Those requests reveal the map
                  areas you look at. Previously viewed areas stay available offline.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="routing-url">
                  Routing service (OSRM compatible)
                </label>
                <input
                  id="routing-url"
                  className="input"
                  value={settings.routingBaseUrl}
                  onChange={(event) => void updateSettings({ routingBaseUrl: event.target.value })}
                  placeholder="https://router.project-osrm.org"
                />
                <p className="hint">
                  Used only when you open the directions screen. The public demo server is best-effort
                  with no uptime guarantee and a fair-use limit; for regular use, point this at your
                  own OSRM instance. No API key is stored in the app bundle.
                </p>
              </div>

              <div>
                <span className="label">Preferred travel mode</span>
                <div className="flex flex-wrap gap-2">
                  {(['driving', 'walking', 'cycling'] as const).map((profile) => (
                    <button
                      key={profile}
                      type="button"
                      className={`chip ${settings.routingProfile === profile ? 'chip-active' : ''}`}
                      onClick={() => void updateSettings({ routingProfile: profile })}
                    >
                      <Navigation className="h-3 w-3" />
                      {profile[0].toUpperCase() + profile.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-200 p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-brand-700"
                  checked={settings.reverseGeocodingEnabled}
                  onChange={(event) =>
                    void updateSettings({ reverseGeocodingEnabled: event.target.checked })
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-ink-800">
                    Allow address lookup from coordinates
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-500">
                    When enabled, tapping “Look up address” sends the shop's latitude and longitude to{' '}
                    {(() => {
                      try {
                        return new URL(settings.geocodingBaseUrl).host
                      } catch {
                        return settings.geocodingBaseUrl
                      }
                    })()}
                    . Off by default — you can always type the address yourself.
                  </span>
                </span>
              </label>
            </div>
          </DataState>
        </section>

        {/* --------------------------------- Storage --------------------------------- */}
        <section className="card p-4">
          <h2 className="section-title">
            <HardDrive className="h-4 w-4 text-brand-700" />
            Local storage
          </h2>

          <DataState loading={loading} error={error} onRetry={reload}>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Shops saved</dt>
                <dd className="font-medium text-ink-800">{shops.length}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Visit records</dt>
                <dd className="font-medium text-ink-800">{visits?.length ?? 0}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Storage used</dt>
                <dd className="font-medium text-ink-800">
                  {estimate
                    ? `${formatBytes(estimate.usage)} of ${formatBytes(estimate.quota)}`
                    : 'Not reported by this browser'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Persistent storage</dt>
                <dd className="font-medium text-ink-800">
                  {persisted === null ? 'Unknown' : persisted ? 'Granted' : 'Not granted'}
                </dd>
              </div>
            </dl>

            {!persisted && (
              <button type="button" className="btn-secondary mt-3 w-full" onClick={handleRequestPersistence}>
                <Database className="h-4 w-4" />
                Ask the browser to keep my data
              </button>
            )}

            <p className="hint mt-2">
              Everything lives in this browser's IndexedDB on this device. Clearing site data,
              reinstalling the browser or using private mode can remove it — export backups regularly.
            </p>

            <div className="mt-4 border-t border-ink-200 pt-4">
              <h3 className="text-sm font-semibold text-red-700">Erase all local data</h3>
              <p className="mt-1 text-xs text-ink-500">
                Deletes every shop and visit record and resets the encryption configuration on this
                device. Export a backup first if you might need the data.
              </p>
              <button
                type="button"
                className="btn-danger mt-2"
                onClick={handleEraseEverything}
                disabled={busy === 'erase'}
              >
                {busy === 'erase' ? <Spinner className="text-white" /> : <Trash2 className="h-4 w-4" />}
                Erase all local data
              </button>
            </div>
          </DataState>
        </section>

        {/* ---------------------------------- App ---------------------------------- */}
        <section className="card p-4 lg:col-span-2">
          <h2 className="section-title">
            <Smartphone className="h-4 w-4 text-brand-700" />
            Install &amp; offline use
          </h2>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-ink-200 p-3">
              <h3 className="text-sm font-semibold text-ink-800">Install the app</h3>
              <p className="mt-1 text-xs text-ink-500">
                Installing adds an icon to your home screen and lets the app open without a network
                connection for everything except live maps and routing.
              </p>

              {installed ? (
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <Check className="h-3.5 w-3.5" />
                  Already running as an installed app
                </p>
              ) : installEvent ? (
                <button type="button" className="btn-primary btn-sm mt-2" onClick={handleInstall}>
                  <Smartphone className="h-3.5 w-3.5" />
                  Install now
                </button>
              ) : (
                <p className="mt-2 text-xs text-ink-500">
                  Use your browser menu — “Add to Home screen” on Android, or Share → “Add to Home
                  Screen” on iOS Safari. The option appears only over https and is unavailable in some
                  desktop browsers.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-ink-200 p-3">
              <h3 className="text-sm font-semibold text-ink-800">Two devices, two databases</h3>
              <p className="mt-1 text-xs text-ink-500">
                Installing the app on a second phone creates a separate, empty database. Records are
                not synchronised — transfer them with an encrypted backup file (Backup &amp; Restore
                page).
              </p>
              <Link to="/backup" className="btn-secondary btn-sm mt-2">
                <Download className="h-3.5 w-3.5" />
                Go to backup
              </Link>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 p-3 text-xs text-ink-600">
            <p className="flex items-center gap-1.5 font-semibold text-ink-700">
              <Info className="h-3.5 w-3.5" />
              Privacy summary
            </p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>Your shops, contacts, coordinates and visit notes stay in this browser.</li>
              <li>No analytics, no advertising scripts, no accounts, no server of our own.</li>
              <li>
                Network requests are limited to: map tiles (OpenStreetMap/OpenTopoMap), the routing
                service when you open directions, and address lookup if you enable it.
              </li>
              <li>Backups are only ever created when you press the download button.</li>
            </ul>
          </div>
        </section>
      </div>
    </>
  )
}
