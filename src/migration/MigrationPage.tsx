import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/common'
import { useConfirm } from '@/app/providers'
import { getEncryptionMeta } from './legacy/settingsService'
import { setDataPassphrase, refreshLocalData, mergeAndSaveLocalData, type AppData } from '@/services/localDataStore'
import { clearLegacyLocalDatabase, readIndexedDb, unlockLegacyStorage, type InvalidLegacyRecord, type LegacyData } from './readLegacyData'
import { mergeLegacyData } from './mergeLegacyData'
import { formatBytes } from '@/utils/image'

type PreviewState = { local: LegacyData; file: AppData; merged: AppData }

function download(filename: string, value: unknown): void {
  const href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = href; anchor.download = filename; anchor.click()
  URL.revokeObjectURL(href)
}

export default function MigrationPage() {
  const confirm = useConfirm()
  const [localPassword, setLocalPassword] = useState('')
  const [dataPassword, setDataPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [verified, setVerified] = useState(false)

  const orphanVisits = useMemo(() => preview?.merged.visits.filter((visit) => !preview.merged.shops.some((shop) => shop.id === visit.shopId)) ?? [], [preview])
  const invalid = useMemo<InvalidLegacyRecord[]>(() => preview?.local.invalid ?? [], [preview])

  async function makePreview() {
    setBusy(true); setError(''); setMessage('')
    try {
      const encryption = await getEncryptionMeta()
      if (encryption.mode === 'encrypted') await unlockLegacyStorage(localPassword)
      const local = await readIndexedDb()
      setDataPassphrase(dataPassword)
      const file = await refreshLocalData()
      const merged = mergeLegacyData(local, { ...file, invalid: [] })
      setPreview({ local, file, merged })
      setVerified(false)
      setMessage('Preview ready. Download the backup before uploading.')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not read the old data.') }
    finally { setBusy(false) }
  }

  async function uploadAndVerify() {
    if (!preview) return
    setBusy(true); setError(''); setMessage('')
    try {
      const oldMerged = preview.local
      const uploaded = await mergeAndSaveLocalData({ shops: oldMerged.shops, visits: oldMerged.visits, settings: oldMerged.settings, deleted: oldMerged.deleted })
      const downloaded = await refreshLocalData()
      const shopIds = new Set(downloaded.shops.map((shop) => shop.id))
      const visitIds = new Set(downloaded.visits.map((visit) => visit.id))
      const problems = [
        ...uploaded.shops.filter((shop) => !shopIds.has(shop.id)).map((shop) => `Missing shop: ${shop.id}`),
        ...uploaded.visits.filter((visit) => !visitIds.has(visit.id)).map((visit) => `Missing visit: ${visit.id}`),
        ...(downloaded.shops.length !== uploaded.shops.length ? ['Shop count does not match the uploaded result.'] : []),
        ...(downloaded.visits.length !== uploaded.visits.length ? ['Visit count does not match the uploaded result.'] : []),
      ]
      if (problems.length) throw new Error(`Verification failed:\n${problems.join('\n')}`)
      setVerified(true)
      setMessage(`Verified: ${downloaded.shops.length} shops and ${downloaded.visits.length} visits.`)
      setPreview((old) => old ? {
        ...old,
        file: downloaded,
        merged: mergeLegacyData({ ...old.merged, invalid: [] }, { ...downloaded, invalid: [] }),
      } : old)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Upload verification failed.') }
    finally { setBusy(false) }
  }

  async function clearLocal() {
    const result = await confirm({ title: 'Clear old data on this device?', message: 'This permanently deletes the Dexie database on this device. The database/data.json copy has been verified, but download a backup before continuing.', confirmLabel: 'Clear old local data', tone: 'danger' })
    if (!result.confirmed) return
    setBusy(true)
    try { await clearLegacyLocalDatabase(); setMessage('Old IndexedDB data cleared from this device.') }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not clear old local data.') }
    finally { setBusy(false) }
  }

  const byteCount = preview ? new Blob([JSON.stringify(preview.merged)]).size : 0
  return (
    <>
      <PageHeader title="Move old data" description="Preview, back up, upload, then verify before clearing anything on this device." />
      <section className="card space-y-4 p-4">
        <h2 className="section-title">Read this device's old data</h2>
        <label className="block text-sm">Old local master password (if local encryption was enabled)
          <input className="input mt-1 w-full" type="password" value={localPassword} onChange={(event) => setLocalPassword(event.target.value)} />
        </label>
        <label className="block text-sm">Local data file passphrase
          <input className="input mt-1 w-full" type="password" value={dataPassword} onChange={(event) => setDataPassword(event.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy} onClick={() => void makePreview()}>Preview IndexedDB + local file</button>
        </div>
      </section>

      {preview && <section className="card mt-4 space-y-3 p-4">
        <h2 className="section-title">Migration preview</h2>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p>IndexedDB: {preview.local.shops.length} shops, {preview.local.visits.length} visits</p>
          <p>Already in database/data.json: {preview.file.shops.length} shops, {preview.file.visits.length} visits</p>
          <p>Final: {preview.merged.shops.length} shops, {preview.merged.visits.length} visits</p>
          <p>File estimate: {formatBytes(byteCount)}</p>
          <p>Orphan visits: {orphanVisits.length}</p>
        </div>
        {orphanVisits.length > 0 && <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">Orphan visits are kept in the migration backup and local data file.</div>}
        {invalid.length > 0 && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm">
          <p>{invalid.length} invalid record(s) will not be uploaded. Download their raw records for review.</p>
          <button className="btn-secondary btn-sm mt-2" onClick={() => download('my-visited-shops-invalid-records.json', invalid)}>Download invalid records</button>
          <ul className="mt-2 list-disc pl-5">{invalid.map((item, index) => <li key={`${item.source}-${item.id}-${index}`}>{item.source} {item.kind} {item.id}: {item.reason}</li>)}</ul>
        </div>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => download('my-visited-shops-migration-backup.json', preview.merged)}>Download backup</button>
          <button className="btn-primary" disabled={busy} onClick={() => void uploadAndVerify()}>Upload and verify</button>
          <button className="btn-danger" disabled={busy || !verified} onClick={() => void clearLocal()}>Clear old data on this device</button>
          <Link className="btn-secondary" to="/settings">Back to Settings</Link>
        </div>
        {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
        {error && <p role="alert" className="whitespace-pre-line text-sm text-red-700">{error}</p>}
      </section>}
      {!preview && (message || error) && <p role={error ? 'alert' : 'status'} className="mt-3 text-sm">{error || message}</p>}
    </>
  )
}
