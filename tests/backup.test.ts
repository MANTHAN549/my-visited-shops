import { beforeEach, describe, expect, it } from 'vitest'
import { db, openDatabase } from '@/database/db'
import {
  buildBackup,
  parseBackupFile,
  previewBackup,
  restoreBackup,
  backupFilename,
} from '@/services/backupService'
import { createShop, listShops, getShop } from '@/services/shopService'
import { createVisit, listVisits, listVisitsForShop } from '@/services/visitService'
import { clearSessionKey } from '@/services/encryptionService'
import { BACKUP_FORMAT_VERSION } from '@/types'

const shopInput = {
  name: 'Patel Stationers',
  category: 'Stationery',
  address: '5 Station Road, Surat',
  latitude: 21.1702,
  longitude: 72.8311,
  primaryOwnerName: 'Nilesh Patel',
  primaryOwnerPhone: '+91 90000 11111',
  contacts: [{ id: 'x1', name: 'Meena Patel', phone: '+91 90000 22222', role: 'Staff' as const }],
  notes: 'Good for bulk paper.',
  tags: ['paper'],
  imageDataUrl: null,
}

async function resetDatabase() {
  await openDatabase()
  await db.shops.clear()
  await db.visits.clear()
  await db.meta.clear()
  clearSessionKey()
}

/** Seed one shop with two visits and return the shop id. */
async function seed() {
  const shop = await createShop(shopInput)
  await createVisit({
    shopId: shop.id,
    visitedAt: '2026-02-01T10:00:00.000Z',
    note: 'Bought 500 sheets',
    purpose: 'Purchase',
    amountSpent: '450',
  })
  await createVisit({
    shopId: shop.id,
    visitedAt: '2026-03-15T16:00:00.000Z',
    note: 'Ordered registers',
    purpose: 'Order',
    amountSpent: '1200',
  })
  return shop.id
}

describe('backup export', () => {
  beforeEach(resetDatabase)

  it('names the file with the export date', () => {
    expect(backupFilename()).toMatch(/^my-visited-shops-backup-\d{4}-\d{2}-\d{2}\.json$/)
  })

  it('builds an encrypted backup that does not expose plaintext', async () => {
    await seed()
    const result = await buildBackup({ encrypt: true, password: 'backup-password-1' })

    expect(result.encrypted).toBe(true)
    expect(result.counts).toEqual({ shops: 1, visits: 2 })
    expect(result.content).not.toContain('Patel Stationers')
    expect(result.content).not.toContain('90000 11111')
    expect(result.content).not.toContain('Bought 500 sheets')

    const parsed = JSON.parse(result.content)
    expect(parsed.format).toBe('my-visited-shops-backup')
    expect(parsed.version).toBe(BACKUP_FORMAT_VERSION)
    expect(parsed.cipher.algorithm).toBe('AES-GCM')
    expect(parsed.cipher.kdf).toBe('PBKDF2-SHA256')
    expect(parsed.cipher.iterations).toBeGreaterThanOrEqual(600_000)
    expect(parsed.integrity).toHaveLength(64)
  })

  it('builds a plain backup when encryption is not requested', async () => {
    await seed()
    const result = await buildBackup({ encrypt: false })
    expect(result.encrypted).toBe(false)
    expect(result.content).toContain('Patel Stationers')
    expect(JSON.parse(result.content).data.shops).toHaveLength(1)
  })

  it('requires a password for an encrypted backup', async () => {
    await seed()
    await expect(buildBackup({ encrypt: true })).rejects.toThrow(/password is required/i)
  })
})

describe('backup import validation', () => {
  beforeEach(resetDatabase)

  it('rejects a file that is not JSON', () => {
    expect(() => parseBackupFile('this is not json')).toThrow(/not valid JSON/i)
  })

  it('rejects a JSON file from another application', () => {
    expect(() => parseBackupFile(JSON.stringify({ hello: 'world' }))).toThrow(
      /not created by My Visited Shops/i,
    )
  })

  it('rejects a backup from a newer format version', () => {
    const envelope = {
      format: 'my-visited-shops-backup',
      version: BACKUP_FORMAT_VERSION + 5,
      exportedAt: new Date().toISOString(),
      encrypted: false,
      integrity: '',
      data: { shops: [], visits: [] },
    }
    expect(() => parseBackupFile(JSON.stringify(envelope))).toThrow(/newer version/i)
  })

  it('rejects an encrypted backup with an incomplete cipher block', () => {
    const envelope = {
      format: 'my-visited-shops-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      encrypted: true,
      integrity: '',
      cipher: { algorithm: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations: 600_000, salt: 'abc' },
    }
    expect(() => parseBackupFile(JSON.stringify(envelope))).toThrow(/encryption block is incomplete/i)
  })

  it('rejects a malformed payload with missing arrays', async () => {
    const envelope = parseBackupFile(
      JSON.stringify({
        format: 'my-visited-shops-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        encrypted: false,
        integrity: '',
        data: { shops: 'not-an-array' },
      }),
    )
    await expect(previewBackup(envelope)).rejects.toThrow(/malformed/i)
  })
})

describe('backup restore', () => {
  beforeEach(resetDatabase)

  it('restores an encrypted backup onto an empty database', async () => {
    await seed()
    const exported = await buildBackup({ encrypt: true, password: 'backup-password-1' })

    // Wipe the device, as if we were on a second phone.
    await db.shops.clear()
    await db.visits.clear()

    const envelope = parseBackupFile(exported.content)
    const preview = await previewBackup(envelope, 'backup-password-1')
    expect(preview.counts).toEqual({ shops: 1, visits: 2 })
    expect(preview.payload?.shops[0].name).toBe('Patel Stationers')

    const result = await restoreBackup(preview, { mode: 'replace' })
    expect(result.importedShops).toBe(1)
    expect(result.importedVisits).toBe(2)

    const shops = await listShops()
    const visits = await listVisits()
    expect(shops).toHaveLength(1)
    expect(visits).toHaveLength(2)

    // Referential integrity and rollups are rebuilt from the imported visits.
    expect(visits.every((v) => v.shopId === shops[0].id)).toBe(true)
    expect(shops[0].visitCount).toBe(2)
    expect(shops[0].lastVisitedAt).toBe('2026-03-15T16:00:00.000Z')
  })

  it('fails to decrypt with the wrong password and leaves data untouched', async () => {
    await seed()
    const exported = await buildBackup({ encrypt: true, password: 'backup-password-1' })
    const envelope = parseBackupFile(exported.content)

    await expect(previewBackup(envelope, 'the-wrong-password')).rejects.toThrow(
      /password is wrong|modified/i,
    )

    // Original data is still there and unchanged.
    expect(await listShops()).toHaveLength(1)
    expect(await listVisits()).toHaveLength(2)
  })

  it('detects a tampered payload via the integrity hash', async () => {
    await seed()
    const exported = await buildBackup({ encrypt: false })
    const parsed = JSON.parse(exported.content)

    // Edit the payload after the hash was computed.
    parsed.data.shops[0].name = 'Tampered Name'

    const envelope = parseBackupFile(JSON.stringify(parsed))
    await expect(previewBackup(envelope)).rejects.toThrow(/integrity check/i)
  })

  it('does not corrupt existing data when an invalid backup is imported', async () => {
    const shopId = await seed()

    // A structurally valid file whose payload is junk.
    const broken = parseBackupFile(
      JSON.stringify({
        format: 'my-visited-shops-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        encrypted: false,
        integrity: 'deadbeef',
        data: { shops: [], visits: [] },
      }),
    )

    await expect(previewBackup(broken)).rejects.toThrow()

    expect(await listShops()).toHaveLength(1)
    expect(await listVisits()).toHaveLength(2)
    expect((await getShop(shopId))?.name).toBe('Patel Stationers')
  })

  it('merges without overwriting a newer local record', async () => {
    const shopId = await seed()
    const exported = await buildBackup({ encrypt: false })

    // Edit the local record after the backup was taken.
    const { updateShop } = await import('@/services/shopService')
    await updateShop(shopId, { ...shopInput, name: 'Patel Stationers (newer local edit)' })

    const envelope = parseBackupFile(exported.content)
    const preview = await previewBackup(envelope)

    // The backup carries the same id, so it is reported as a duplicate.
    expect(preview.duplicateShopIds).toContain(shopId)

    const result = await restoreBackup(preview, { mode: 'merge' })
    expect(result.skippedShops).toBe(1)

    // The newer local edit survived.
    expect((await getShop(shopId))?.name).toBe('Patel Stationers (newer local edit)')
  })

  it('replaces everything when the replace mode is chosen', async () => {
    await seed()
    const exported = await buildBackup({ encrypt: false })

    // A second local shop that must disappear after a replace restore.
    await createShop({ ...shopInput, name: 'Shop To Be Removed' })
    expect(await listShops()).toHaveLength(2)

    const preview = await previewBackup(parseBackupFile(exported.content))
    await restoreBackup(preview, { mode: 'replace' })

    const shops = await listShops()
    expect(shops).toHaveLength(1)
    expect(shops[0].name).toBe('Patel Stationers')
  })

  it('drops orphan visits that point at a missing shop', async () => {
    const envelope = parseBackupFile(
      JSON.stringify({
        format: 'my-visited-shops-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        encrypted: false,
        integrity: '',
        data: {
          shops: [],
          visits: [
            {
              id: 'v1',
              shopId: 'missing-shop',
              visitedAt: '2026-01-01T00:00:00.000Z',
              note: 'orphan',
              purpose: '',
              amountSpent: '',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      }),
    )

    const preview = await previewBackup(envelope)
    expect(preview.counts.visits).toBe(0)
  })

  it('keeps shop-to-visit relationships after export and re-import', async () => {
    const shopId = await seed()
    const exported = await buildBackup({ encrypt: true, password: 'another-password' })

    await db.shops.clear()
    await db.visits.clear()

    const preview = await previewBackup(parseBackupFile(exported.content), 'another-password')
    await restoreBackup(preview, { mode: 'replace' })

    const visits = await listVisitsForShop(shopId)
    expect(visits).toHaveLength(2)
    expect(visits.map((v) => v.note)).toContain('Bought 500 sheets')
    expect(visits.map((v) => v.note)).toContain('Ordered registers')
  })
})
