import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getGithubConfig, initializeGithubStore, removeGithubToken, saveGithubConfig,
  setGithubPassphrase, testGithubConnection,
} from '@/services/githubStore'
import { formatBytes } from '@/utils/image'

type Status = 'Saved' | 'Saving…' | 'Error'

export function GithubSettingsPanel() {
  const [config, setConfig] = useState(getGithubConfig)
  const [secret, setSecret] = useState('')
  const [status, setStatus] = useState<Status>('Saved')
  const [message, setMessage] = useState('')
  const [size, setSize] = useState<number | null>(null)

  useEffect(() => {
    const onFocus = () => { setConfig(getGithubConfig()); void testGithubConnection().then(setSize).catch(() => undefined) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  function saveConfig() {
    setStatus('Saving…')
    try {
      saveGithubConfig(config)
      setStatus('Saved')
      setMessage('GitHub settings saved on this device.')
    } catch (error) {
      setStatus('Error')
      setMessage(error instanceof Error ? error.message : 'Could not save GitHub settings.')
    }
  }

  async function test() {
    setStatus('Saving…')
    setMessage('')
    try {
      saveGithubConfig(config)
      const bytes = await testGithubConnection()
      setSize(bytes)
      setStatus('Saved')
      setMessage('Connection and encrypted data verified.')
    } catch (error) {
      setStatus('Error')
      setMessage(error instanceof Error ? error.message : 'Could not connect to GitHub.')
    }
  }

  async function setupPassphrase() {
    setStatus('Saving…')
    setMessage('')
    try {
      await initializeGithubStore(secret)
      setGithubPassphrase(secret)
      setSecret('')
      setStatus('Saved')
      setMessage('GitHub data is unlocked in memory for this session.')
    } catch (error) {
      setStatus('Error')
      setMessage(error instanceof Error ? error.message : 'Could not initialize GitHub storage.')
    }
  }

  return (
    <section className="card p-4 lg:col-span-2">
      <h2 className="section-title">Private GitHub data storage</h2>
      <p className="mt-2 text-sm text-ink-600">Shop records are encrypted before they are saved in your private GitHub repository. The GitHub token is stored only on this device.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">GitHub username
          <input className="input mt-1 w-full" autoComplete="username" value={config.owner} onChange={(e) => setConfig({ ...config, owner: e.target.value })} />
        </label>
        <label className="text-sm">Private data repository
          <input className="input mt-1 w-full" value={config.repo} onChange={(e) => setConfig({ ...config, repo: e.target.value })} />
        </label>
        <label className="text-sm">Branch
          <input className="input mt-1 w-full" value={config.branch} onChange={(e) => setConfig({ ...config, branch: e.target.value })} />
        </label>
        <label className="text-sm">Fine-grained token
          <input className="input mt-1 w-full" type="password" autoComplete="new-password" value={config.token} onChange={(e) => setConfig({ ...config, token: e.target.value })} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-primary btn-sm" type="button" onClick={saveConfig}>Save GitHub settings</button>
        <button className="btn-secondary btn-sm" type="button" onClick={() => void test()}>Test connection / Refresh</button>
        <button className="btn-secondary btn-sm" type="button" onClick={() => { removeGithubToken(); setConfig({ ...config, token: '' }); setMessage('Token removed from this device.') }}>Remove token from this device</button>
      </div>
      <p className="mt-2 text-xs text-ink-500">Status: {status}{size !== null && <> · data file {formatBytes(size)}{size > 5 * 1024 * 1024 && ' · large file warning'}</>}</p>
      {size !== null && size > 5 * 1024 * 1024 && <p className="mt-1 text-sm text-amber-800">This data file is larger than 5 MB. Large files may be slower to load.</p>}
      <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <label className="text-sm font-medium text-amber-950">GitHub data passphrase
          <input className="input mt-1 w-full" type="password" autoComplete="current-password" value={secret} onChange={(e) => setSecret(e.target.value)} />
        </label>
        <p className="mt-2 text-xs text-amber-900">Set the same passphrase on every device. If you forget it, the encrypted data cannot be recovered.</p>
        <button className="btn-secondary btn-sm mt-2" type="button" onClick={() => void setupPassphrase()}>Unlock / set up passphrase</button>
      </div>
      {message && <p role={status === 'Error' ? 'alert' : 'status'} className={`mt-3 text-sm ${status === 'Error' ? 'text-red-700' : 'text-emerald-800'}`}>{message}</p>}
      <Link className="btn-secondary btn-sm mt-3 inline-flex" to="/migrate">Move old data</Link>
    </section>
  )
}
