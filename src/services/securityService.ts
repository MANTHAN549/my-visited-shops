/**
 * Security service - switching the local storage mode.
 *
 * Encryption can be enabled on an existing dataset (records are re-encrypted in
 * one transaction), the master password can be changed, and encryption can be
 * turned off again. The master password is never stored anywhere.
 */
import { clearSessionKey, createEncryptionMeta, deriveKey, setSessionKey, unlockWithPassword } from './encryptionService'
import { clearEncryptionMeta, getEncryptionMeta, saveEncryptionMeta } from './settingsService'
import { listShops, reencodeShops } from './shopService'
import { listVisits, reencodeVisits } from './visitService'
import { recomputeAllRollups } from './visitService'

export const MIN_PASSWORD_LENGTH = 8

export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string; advice: string } {
  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1

  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'] as const
  const advice =
    score <= 1
      ? 'Use at least 12 characters, mixing upper and lower case, digits and symbols.'
      : score === 2
        ? 'Add a few more characters, or mix in digits and symbols.'
        : 'Good. Store it in a password manager — it cannot be recovered.'

  return { score: score as 0 | 1 | 2 | 3 | 4, label: labels[score], advice }
}

/** Turn on encryption for the existing local records. */
export async function enableEncryption(password: string): Promise<void> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters for the master password.`)
  }

  const existing = await getEncryptionMeta()
  if (existing.mode === 'encrypted') {
    throw new Error('Encryption is already enabled on this device.')
  }

  // Read everything with the current (plain) codec first.
  const [shops, visits] = await Promise.all([listShops(), listVisits()])

  const { meta, key } = await createEncryptionMeta(password)

  // Re-encode inside transactions; if this throws, the old records are intact.
  await reencodeShops(shops, { key }, true)
  await reencodeVisits(visits, { key }, true)

  await saveEncryptionMeta(meta)
  setSessionKey(key)
}

/** Turn encryption off and rewrite every record as plain JSON. */
export async function disableEncryption(currentPassword: string): Promise<void> {
  const meta = await getEncryptionMeta()
  if (meta.mode !== 'encrypted') return

  // Verify the password before touching anything.
  await unlockWithPassword(currentPassword, meta)

  const [shops, visits] = await Promise.all([listShops(), listVisits()])

  await reencodeShops(shops, { key: null }, true)
  await reencodeVisits(visits, { key: null }, true)

  await clearEncryptionMeta()
  clearSessionKey()
}

/** Change the master password (re-derives the key and re-encrypts everything). */
export async function changeMasterPassword(currentPassword: string, nextPassword: string): Promise<void> {
  if (nextPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters for the new master password.`)
  }

  const meta = await getEncryptionMeta()
  if (meta.mode !== 'encrypted') {
    throw new Error('Encryption is not enabled on this device.')
  }

  const currentKey = await unlockWithPassword(currentPassword, meta)
  const [shops, visits] = await Promise.all([listShops(), listVisits()])

  const { meta: nextMeta, key: nextKey } = await createEncryptionMeta(nextPassword)

  await reencodeShops(shops, { key: nextKey }, true)
  await reencodeVisits(visits, { key: nextKey }, true)

  await saveEncryptionMeta(nextMeta)
  setSessionKey(nextKey)
  void currentKey // the previous key is replaced; it is not retained
}

/**
 * Re-derive the key from a password without changing anything. Used by the
 * "verify password" step before destructive actions.
 */
export async function verifyMasterPassword(password: string): Promise<boolean> {
  const meta = await getEncryptionMeta()
  if (meta.mode !== 'encrypted') return true
  try {
    await unlockWithPassword(password, meta)
    return true
  } catch {
    return false
  }
}

/** Derive a key for a manual unlock (used by tests). */
export { deriveKey }

/** Recompute shop visit counters (used after maintenance operations). */
export { recomputeAllRollups }
