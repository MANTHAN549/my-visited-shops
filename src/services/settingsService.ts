import type { AppSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'
import { refreshLocalData, saveLocalSettings } from './localDataStore'

export async function getSettings(): Promise<AppSettings> {
  return (await refreshLocalData()).settings
}
export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings().catch(() => DEFAULT_SETTINGS)
  return saveLocalSettings({ ...current, ...patch })
}
