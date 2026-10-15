import type { AppSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'
import { refreshGithubData, saveGithubSettings } from './githubStore'

export async function getSettings(): Promise<AppSettings> {
  return (await refreshGithubData()).settings
}
export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings().catch(() => DEFAULT_SETTINGS)
  return saveGithubSettings({ ...current, ...patch })
}
