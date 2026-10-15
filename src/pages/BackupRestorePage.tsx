import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Database,
  Download,
  FileJson,
  HardDriveDownload,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { DataState, EmptyState, PageHeader, Spinner } from '@/components/common'
import { useConfirm, useToast } from '@/app/providers'
import { bumpRevision, useShops, useVisits } from '@/hooks'
import {
  backupFilename,
  buildBackup,
  parseBackupFile,
  previewBackup,
  readBackupFile,
  restoreBackup,
  type BackupPreview,
} from '@/services/backupService'
import { downloadTextFile } from '@/utils/csv'
import { formatDateTime, pluralize } from '@/utils/format'
import type { BackupFile } from '@/types'

type Stage = 'idle' | 'preview' | 'restoring' | 'done'

/** Backup & Restore: encrypted JSON export, validated import, device transfer. */
export default function BackupRestorePage() {
  const { success, error: toastError, warning, info } = useToast()
  const confirm = useConfirm()

  const { shops, loading, error, locked, reload } = useShops()
  const { data: visits } = useVisits()

  /* ------------------------------- export state ------------------------------- */
  const [exportEncrypted, setExportEncrypted] = useState(true)
  const [exportPassword, setExportPassword] = useState('')
  const [exportPassword2, setExportPassword2] = useState('')
  const [exporting, setExporting] = useState(false)

  /* ------------------------------- import state ------------------------------- */
  const [file, setFile] = useState<{ name: string; size: number; raw: string } | null>(null)
  const [envelope, setEnvelope] = useState<BackupFile | null>(null)
  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const [importPassword, setImportPassword] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function handleExport() {
    if (exportEncrypted) {
      if (!exportPassword) {
        warning('Enter a backup password', 'The password encrypts the backup file itself.')
        return
      }
      if (exportPassword !== exportPassword2) {
        warning('Passwords do not match', 'Type the same backup password twice.')
        return
      }
      if (exportPassword.length < 8) {
        warning('Password too short', 'Use at least 8 characters for the backup password.')
        return
      }
    }

    setExporting(true)
    try {
      const result = await buildBackup({
        encrypt: exportEncrypted,
        password: exportEncrypted ? exportPassword : undefined,
      })

      downloadTextFile(result.filename, result.content, 'application/json')

      setExportPassword('')
      setExportPassword2('')

      if (exportEncrypted) {
        success(
          'Encrypted backup downloaded',
          `${pluralize(result.counts.shops, 'shop')} and ${pluralize(result.counts.visits, 'visit record')} written to ${result.filename}. ` +
            'Remember the backup password â€” without it the file cannot be restored.',
        )
      } else {
        warning(
          'Plain-text backup downloaded',
          'This file is NOT encrypted. Anyone who opens it can read your shop names, phone numbers, coordinates and visit notes. ' +
            'Delete it once it is no longer needed, or use an encrypted backup instead.',
        )
      }
    } catch (err) {
      toastError('Could not create the backup', (err as Error).message)
    } finally {
      setExporting(false)
    }
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (!selected) return

    setImportError(null)
    setPreview(null)
    setEnvelope(null)
    setImportPassword('')
    setStage('idle')

    try {
      const raw = await readBackupFile(selected)
      const parsed = parseBackupFile(raw)

      setFile({ name: selected.name, size: selected.size, raw })
      setEnvelope(parsed)

      if (!parsed.encrypted) {
        // Plain backup: we can preview it immediately.
        const result = await previewBackup(parsed)
        setPreview(result)
        setStage('preview')
      } else {
        info('Encrypted backup', 'Enter the password that was used when this backup was exported.')
      }
    } catch (err) {
      setImportError((err as Error).message)
      toastError('This backup cannot be read', (err as Error).message)
    }
  }

  async function handleDecrypt() {
    if (!envelope) return
    setImportError(null)
    try {
      const result = await previewBackup(envelope, importPassword)
      setPreview(result)
      setStage('preview')
      success('Backup decrypted', 'Review the summary below, then choose how to import it.')
    } catch (err) {
      setImportError((err as Error).message)
      toastError('Could not decrypt the backup', (err as Error).message)
    }
  }

  async function handleRestore(mode: 'merge' | 'replace') {
    if (!preview) return

    const answer = await confirm({
      title: mode === 'replace' ? 'Replace all local records?' : 'Merge this backup into your data?',
      message:
        mode === 'replace'
          ? `Every shop and visit in the local database file will be replaced by the backup.\n\n` +
            `Shops to import: ${preview.counts.shops}\nVisit records to import: ${preview.counts.visits}\n\n` +
            'This cannot be undone. Consider exporting a backup of the current data first.'
          : `The backup will be merged with the local database file.\n\n` +
            `Shops to import: ${preview.counts.shops}\nVisit records to import: ${preview.counts.visits}\n\n` +
            `Records already here that were edited more recently are kept â€” nothing is silently overwritten.\n\n` +
            `Existing records with the same id: ${preview.duplicateShopIds.length} shop(s), ${preview.duplicateVisitIds.length} visit(s).`,
      confirmLabel: mode === 'replace' ? 'Replace everything' : 'Merge records',
      tone: mode === 'replace' ? 'danger' : 'default',
    })
    if (!answer.confirmed) return

    setStage('restoring')
    try {
      const result = await restoreBackup(preview, {
        mode,
        applySettings: true,
        recomputeRollups: true,
      })

      bumpRevision()
      setStage('done')
      success(
        'Restore complete',
        `${pluralize(result.importedShops, 'shop')} and ${pluralize(result.importedVisits, 'visit record')} imported (${result.mode}).` +
          (result.skippedShops || result.skippedVisits
            ? ` Kept ${result.skippedShops} newer local shop(s) and ${result.skippedVisits} newer local visit(s).`
            : ''),
      )
    } catch (err) {
      setStage('preview')
      toastError('Restore failed', `${(err as Error).message} Nothing was changed.`)
    }
  }

  function resetImport() {
    setFile(null)
    setEnvelope(null)
    setPreview(null)
    setImportPassword('')
    setImportError(null)
    setStage('idle')
  }


  return (
    <>
      <PageHeader
        title="Backup &amp; Restore"
        description="Move your shops and visit history between devices, or keep a safe copy."
        icon={<Database className="h-5 w-5 text-brand-700" />}
        actions={
          <Link to="/settings" className="btn-secondary">
            <ShieldCheck className="h-4 w-4" />
            Security settings
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------------------------------- Export ---------------------------------- */}
        <section className="card p-4">
          <h2 className="section-title">
            <Download className="h-4 w-4 text-brand-700" />
            Export a backup
          </h2>

          <DataState loading={loading} error={error} locked={locked} onRetry={reload}>
            <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 p-3 text-sm">
              <p className="font-medium text-ink-800">
                {pluralize(shops.length, 'shop')} Â· {pluralize(visits?.length ?? 0, 'visit record')}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                Exports contain a copy of your local database data.
              </p>
            </div>

            <div className="mt-3 space-y-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-200 p-3">
                <input
                  type="radio"
                  className="mt-0.5 accent-brand-700"
                  checked={exportEncrypted}
                  onChange={() => setExportEncrypted(true)}
                />
                <span>
                  <span className="block text-sm font-medium text-ink-800">
                    Encrypted backup (recommended)
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-500">
                    AES-GCM with a key derived from your backup password (PBKDF2-SHA256). The file is
                    unreadable without the password.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-200 p-3">
                <input
                  type="radio"
                  className="mt-0.5 accent-brand-700"
                  checked={!exportEncrypted}
                  onChange={() => setExportEncrypted(false)}
                />
                <span>
                  <span className="block text-sm font-medium text-ink-800">
                    Plain JSON backup (not encrypted)
                  </span>
                  <span className="mt-0.5 block text-xs text-amber-700">
                    Anyone who opens the file can read your shops, phone numbers, coordinates and
                    notes.
                  </span>
                </span>
              </label>

              {exportEncrypted && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="export-password">
                      Backup password
                    </label>
                    <input
                      id="export-password"
                      type="password"
                      className="input"
                      autoComplete="new-password"
                      value={exportPassword}
                      onChange={(event) => setExportPassword(event.target.value)}
                      placeholder="At least 8 characters"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="export-password-2">
                      Repeat password
                    </label>
                    <input
                      id="export-password-2"
                      type="password"
                      className="input"
                      autoComplete="new-password"
                      value={exportPassword2}
                      onChange={(event) => setExportPassword2(event.target.value)}
                      placeholder="Type it again"
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                className="btn-primary w-full"
                onClick={handleExport}
                disabled={exporting || shops.length === 0}
              >
                {exporting ? <Spinner className="text-white" /> : <HardDriveDownload className="h-4 w-4" />}
                {exporting ? 'Preparingâ€¦' : 'Download backup file'}
              </button>

              <p className="hint">
                Suggested file name: <code>{backupFilename()}</code>. The file includes shops,
                contacts, notes, images, coordinates, visit records and the encryption metadata
                needed to restore it. Your data passphrase is never included.
              </p>

              {shops.length === 0 && (
                <p className="text-xs text-amber-700">
                  There is nothing to back up yet. Add a shop first.
                </p>
              )}
            </div>
          </DataState>
        </section>

        {/* ---------------------------------- Import ---------------------------------- */}
        <section className="card p-4">
          <h2 className="section-title">
            <Upload className="h-4 w-4 text-brand-700" />
            Restore from a backup
          </h2>

          <div className="mt-3">
            <input
              ref={fileInputRef}
              id="backup-file"
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleFileSelected}
            />

            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileJson className="h-4 w-4" />
              Choose a backup file
            </button>

            {file && (
              <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 p-3">
                <p className="truncate text-sm font-medium text-ink-800">{file.name}</p>
                <p className="text-xs text-ink-500">
                  {(file.size / 1024).toFixed(1)} KB Â·{' '}
                  {envelope?.encrypted ? 'encrypted backup' : 'plain backup'} Â· format v
                  {envelope?.version} Â· exported {formatDateTime(envelope?.exportedAt)}
                </p>
              </div>
            )}

            {importError && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {importError}
                  <span className="mt-1 block font-medium">
                    Your existing data has not been touched.
                  </span>
                </span>
              </div>
            )}

            {envelope?.encrypted && !preview && (
              <div className="mt-3 space-y-2">
                <label className="label" htmlFor="import-password">
                  Backup password
                </label>
                <input
                  id="import-password"
                  type="password"
                  className="input"
                  autoComplete="current-password"
                  value={importPassword}
                  onChange={(event) => setImportPassword(event.target.value)}
                  placeholder="Password used when exporting"
                />
                <button
                  type="button"
                  className="btn-primary w-full"
                  onClick={handleDecrypt}
                  disabled={!importPassword}
                >
                  <ShieldCheck className="h-4 w-4" />
                  Decrypt and preview
                </button>
                <p className="hint">
                  An incorrect password cannot decrypt the file â€” you will be told, and nothing will be
                  imported.
                </p>
              </div>
            )}

            {preview && (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
                  <p className="text-sm font-semibold text-brand-900">Backup preview</p>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-brand-900">
                    <li>
                      Shops to import: <strong>{preview.counts.shops}</strong>
                    </li>
                    <li>
                      Visit records to import: <strong>{preview.counts.visits}</strong>
                    </li>
                    <li>Exported: {formatDateTime(preview.exportedAt)}</li>
                    <li>Integrity check: passed (SHA-256 of the payload matches)</li>
                  </ul>
                </div>

                {preview.orphanVisitCount > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This backup contains {preview.orphanVisitCount} orphan visit record(s) without a matching shop. They remain in the backup and will be preserved during restore.</div>}

                {(preview.duplicateShopIds.length > 0 || preview.duplicateVisitIds.length > 0) && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <p className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Duplicate records detected
                    </p>
                    <p className="mt-1">
                      {preview.duplicateShopIds.length} shop(s) and{' '}
                      {preview.duplicateVisitIds.length} visit record(s) already exist in the local database file
                      with the same ids. Merging keeps whichever copy was edited most recently.
                    </p>
                    {preview.conflicts.length > 0 && (
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                        {preview.conflicts.slice(0, 5).map((conflict) => (
                          <li key={conflict.id}>
                            <strong>{conflict.name}</strong> â€” {conflict.reason}
                          </li>
                        ))}
                        {preview.conflicts.length > 5 && (
                          <li>â€¦and {preview.conflicts.length - 5} more</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className="btn-primary flex-1"
                    onClick={() => handleRestore('merge')}
                    disabled={stage === 'restoring'}
                  >
                    {stage === 'restoring' ? <Spinner className="text-white" /> : <ArrowRight className="h-4 w-4" />}
                    Merge into my data
                  </button>

                  <button
                    type="button"
                    className="btn-danger flex-1"
                    onClick={() => handleRestore('replace')}
                    disabled={stage === 'restoring'}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Replace everything
                  </button>
                </div>

                <button type="button" className="btn-ghost w-full" onClick={resetImport}>
                  Cancel and choose another file
                </button>

                <p className="hint">
                  Both options run inside a single database transaction. If anything fails, your
                  existing records stay exactly as they were. Shop-to-visit links are preserved, and
                  shop visit counts are recalculated from the imported records.
                </p>
              </div>
            )}

            {stage === 'done' && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                Restore finished. Open the Dashboard or All Shops to see the imported records.
              </div>
            )}

            {!file && (
              <EmptyState
                className="mt-4 border-0 bg-transparent py-4"
                icon={<Upload className="h-6 w-6" />}
                title="No file selected"
                description="Choose a .json backup created by My Visited Shops. The file is validated before anything is written."
              />
            )}
          </div>
        </section>
      </div>

      {/* ------------------------------- Device transfer ------------------------------- */}
      <section className="card mt-4 p-4">
        <h2 className="section-title">
          <ArrowRight className="h-4 w-4 text-brand-700" />
          Moving to another phone or computer
        </h2>

        <p className="mt-2 text-sm text-ink-600">
          Your local database file stores the data on this computer. Keep an
          exported backup as an independent recovery copy.
        </p>

        <ol className="mt-3 space-y-2 text-sm text-ink-700">
          <li className="flex gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
              1
            </span>
            Export an <strong>encrypted</strong> backup using the form above.
          </li>
          <li className="flex gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
              2
            </span>
            Transfer the file using a method you trust â€” USB cable, your own cloud drive, email to
            yourself, or a direct file transfer. The file is encrypted, so it stays unreadable even if
            the transfer route is not private.
          </li>
          <li className="flex gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
              3
            </span>
            To use this backup on another computer, import the file there.
            Enter the backup password to decrypt it.
          </li>
        </ol>

        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            Keep the backup password safe
          </p>
          <p className="mt-1">
            There is no recovery code and no backdoor. If the backup password is lost, the encrypted
            backup cannot be restored â€” on any device.
          </p>
        </div>
      </section>
    </>
  )
}

