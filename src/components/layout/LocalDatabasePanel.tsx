import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { testLocalDatabase, initializeLocalStore, setDataPassphrase } from '@/services/localDataStore'
import { useLocalData } from '@/services/localDataContext'
import { formatBytes } from '@/utils/image'

type Status = 'Ready' | 'Checking…' | 'Error'

export function LocalDatabasePanel() {
  const { refresh } = useLocalData()
  const [secret, setSecret] = useState('')
  const [status, setStatus] = useState<Status>('Ready')
  const [message, setMessage] = useState('')
  const [size, setSize] = useState<number | null>(null)

  useEffect(() => {
    const onFocus = () => { void testLocalDatabase().then(setSize).catch(() => undefined) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  async function checkDatabase() {
    setStatus('Checking…')
    setMessage('')
    try {
      const bytes = await testLocalDatabase()
      setSize(bytes)
      setStatus('Ready')
      setMessage('Local database file is available and encrypted.')
    } catch (error) {
      setStatus('Error')
      setMessage(error instanceof Error ? error.message : 'Could not read database/data.json.')
    }
  }

  async function setPassphrase() {
    setStatus('Checking…')
    setMessage('')
    try {
      await initializeLocalStore(secret)
      setDataPassphrase(secret)
      await refresh()
      setSecret('')
      setStatus('Ready')
      setMessage('Local data file unlocked for this session.')
    } catch (error) {
      setStatus('Error')
      setMessage(error instanceof Error ? error.message : 'Could not unlock the local database.')
    }
  }

  return (
    <section className="card p-4 lg:col-span-2">
      <h2 className="section-title">Local database file</h2>
      <p className="mt-2 text-sm text-ink-600">Shop, visit, and preference data are encrypted and saved inside this project.</p>
      <p className="mt-2 rounded bg-ink-50 p-2 font-mono text-sm">database/data.json</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-secondary btn-sm" type="button" onClick={() => void checkDatabase()}>Check database file</button>
      </div>
      <p className="mt-2 text-xs text-ink-500">Status: {status}{size !== null && <> · file {formatBytes(size)}{size > 5 * 1024 * 1024 && ' · large file warning'}</>}</p>
      {size !== null && size > 5 * 1024 * 1024 && <p className="mt-1 text-sm text-amber-800">This data file is larger than 5 MB. Large files may be slower to load.</p>}
      <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <label className="text-sm font-medium text-amber-950">Data passphrase
          <input className="input mt-1 w-full" type="password" autoComplete="current-password" value={secret} onChange={(event) => setSecret(event.target.value)} />
        </label>
        <p className="mt-2 text-xs text-amber-900">The passphrase encrypts the file before it is saved. It stays in memory only; keep a secure copy because it cannot be recovered.</p>
        <button className="btn-secondary btn-sm mt-2" type="button" disabled={!secret || status === 'Checking…'} onClick={() => void setPassphrase()}>Unlock / set up passphrase</button>
      </div>
      {message && <p role={status === 'Error' ? 'alert' : 'status'} className={`mt-3 text-sm ${status === 'Error' ? 'text-red-700' : 'text-emerald-800'}`}>{message}</p>}
      <Link className="btn-secondary btn-sm mt-3 inline-flex" to="/migrate">Move old data</Link>
    </section>
  )
}
