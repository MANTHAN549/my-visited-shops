import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Database, Download, ShieldCheck, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/common'
import { GithubSettingsPanel } from '@/components/layout/GithubSettingsPanel'
import { useConfirm, useToast } from '@/app/providers'
import { useSettings, useShops, useVisits } from '@/hooks'
import { eraseGithubData } from '@/services/githubStore'
import { resetAllCaches } from '@/utils/maintenance'

export default function SettingsPage() {
  const { settings, update } = useSettings()
  const { shops } = useShops()
  const { data: visits } = useVisits()
  const confirm = useConfirm()
  const { success, error } = useToast()
  const [busy, setBusy] = useState(false)
  const [savingPreferences, setSavingPreferences] = useState(false)
  const [draft, setDraft] = useState(settings)
  useEffect(() => setDraft(settings), [settings])

  async function savePreferences() {
    setSavingPreferences(true)
    try { await update(draft); success('Preferences saved') }
    catch (failure) { error('Could not save preferences', failure instanceof Error ? failure.message : 'Request failed.') }
    finally { setSavingPreferences(false) }
  }

  async function erase() {
    const answer = await confirm({ title: 'Erase all GitHub data?', message: `This permanently deletes ${shops.length} shops and ${visits.length} visits from the private GitHub data file for every device. Download a backup first.`, confirmLabel: 'Erase all data', tone: 'danger' })
    if (!answer.confirmed) return
    setBusy(true)
    try { await eraseGithubData(); await resetAllCaches(); success('GitHub data erased'); window.location.reload() }
    catch (failure) { error('Could not erase GitHub data', failure instanceof Error ? failure.message : 'Request failed.') }
    finally { setBusy(false) }
  }

  return <>
    <PageHeader title="Settings & Security" description="GitHub storage, encrypted data access, and app preferences." icon={<ShieldCheck className="h-5 w-5 text-brand-700" />} actions={<Link to="/backup" className="btn-secondary"><Download className="h-4 w-4" />Backup & restore</Link>} />
    <div className="grid gap-4 lg:grid-cols-2">
      <GithubSettingsPanel />
      <section className="card p-4">
        <h2 className="section-title">App preferences</h2>
        <label className="mt-3 block text-sm">Map layer<select className="input mt-1 w-full" value={draft.mapLayer} onChange={(event) => setDraft({ ...draft, mapLayer: event.target.value as typeof settings.mapLayer })}><option value="osm">OpenStreetMap</option><option value="topo">OpenTopoMap</option></select></label>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.reverseGeocodingEnabled} onChange={(event) => setDraft({ ...draft, reverseGeocodingEnabled: event.target.checked })} />Enable reverse geocoding</label>
        <label className="mt-3 block text-sm">Routing profile<select className="input mt-1 w-full" value={draft.routingProfile} onChange={(event) => setDraft({ ...draft, routingProfile: event.target.value as typeof settings.routingProfile })}><option value="driving">Driving</option><option value="walking">Walking</option><option value="cycling">Cycling</option></select></label>
        <label className="mt-3 block text-sm">Routing service URL<input className="input mt-1 w-full" type="url" value={draft.routingBaseUrl} onChange={(event) => setDraft({ ...draft, routingBaseUrl: event.target.value })} /></label>
        <label className="mt-3 block text-sm">Reverse geocoding service URL<input className="input mt-1 w-full" type="url" value={draft.geocodingBaseUrl} onChange={(event) => setDraft({ ...draft, geocodingBaseUrl: event.target.value })} /></label>
        <p className="hint mt-2">The data passphrase is requested when this app opens. Map, routing, and geocoding preferences are shared with your encrypted GitHub data.</p>
        <button type="button" className="btn-primary btn-sm mt-3" disabled={savingPreferences} onClick={() => void savePreferences()}>{savingPreferences ? 'Saving…' : 'Save preferences'}</button>
      </section>
      <section className="card p-4">
        <h2 className="section-title flex items-center gap-2"><Database className="h-4 w-4" />Move old data</h2>
        <p className="mt-2 text-sm text-ink-600">Read this device’s IndexedDB data and optionally its old Supabase data, then merge and verify it in your GitHub repository.</p>
        <Link to="/migrate" className="btn-secondary btn-sm mt-3">Open migration tool</Link>
      </section>
      <section className="card border-red-200 p-4">
        <h2 className="section-title text-red-800">Erase GitHub data</h2>
        <p className="mt-2 text-sm text-ink-600">This erases the shared encrypted data file. The action affects every device connected to this repository.</p>
        <button type="button" disabled={busy} onClick={() => void erase()} className="btn-danger btn-sm mt-3"><Trash2 className="h-4 w-4" />{busy ? 'Erasing…' : 'Erase all data'}</button>
      </section>
    </div>
  </>
}
