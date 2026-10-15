import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildBackup, parseBackupFile, previewBackup } from '@/services/backupService'

const store = vi.hoisted(() => ({
  payload: {
    shops: [],
    visits: [],
    settings: { mapLayer: 'osm', reverseGeocodingEnabled: false, routingBaseUrl: 'https://router.project-osrm.org', routingProfile: 'driving', geocodingBaseUrl: 'https://nominatim.openstreetmap.org', autoLockMinutes: 15, mobileListFirst: true },
    deleted: [],
  },
}))
vi.mock('@/services/githubStore', () => ({
  refreshGithubData: async () => store.payload,
  mergeAndUploadGithubData: async () => store.payload,
  replaceGithubPayload: async () => store.payload,
}))

describe('GitHub data backups', () => {
  beforeEach(() => { store.payload.shops = []; store.payload.visits = [] })
  it('encrypts and restores a JSON backup using its separate backup password', async () => {
    const result = await buildBackup({ encrypt: true, password: 'backup password' })
    const envelope = parseBackupFile(result.content)
    expect(envelope.cipher?.ciphertext).toBeTruthy()
    await expect(previewBackup(envelope, 'wrong password')).rejects.toThrow(/wrong backup password/i)
    const preview = await previewBackup(envelope, 'backup password')
    expect(preview.payload).toMatchObject({ shops: [], visits: [] })
  })
  it('keeps plain JSON backups readable', async () => {
    const result = await buildBackup({ encrypt: false })
    const preview = await previewBackup(parseBackupFile(result.content))
    expect(preview.payload?.settings?.mapLayer).toBe('osm')
  })
})
