import { describe, expect, it } from 'vitest'
import {
  base64ToBytes,
  bytesToBase64,
  checkVerifier,
  createEncryptionMeta,
  decryptJson,
  decryptString,
  encryptJson,
  encryptString,
  PBKDF2_MIN_ITERATIONS,
  safeEqual,
  sha256Hex,
  unlockWithPassword,
} from '@/services/encryptionService'

/** Keep the test suite fast; production uses the 600k default. */
const TEST_ITERATIONS = PBKDF2_MIN_ITERATIONS

describe('encryption service', () => {
  it('encrypts and decrypts a string round-trip', async () => {
    const { key } = await createEncryptionMeta('correct horse battery staple', TEST_ITERATIONS)
    const { ciphertext, iv } = await encryptString(key, 'Purchased electrical items.')
    expect(ciphertext).not.toContain('Purchased')
    await expect(decryptString(key, iv, ciphertext)).resolves.toBe('Purchased electrical items.')
  })

  it('encrypts and decrypts a JSON object round-trip', async () => {
    const { key } = await createEncryptionMeta('another strong password', TEST_ITERATIONS)
    const payload = { name: 'Sharma Electricals', latitude: 19.07609, tags: ['hardware'] }
    const { ciphertext, iv } = await encryptJson(key, payload)
    await expect(decryptJson(key, iv, ciphertext)).resolves.toEqual(payload)
  })

  it('uses a different IV for every encryption operation', async () => {
    const { key } = await createEncryptionMeta('password-with-entropy', TEST_ITERATIONS)
    const first = await encryptString(key, 'same plaintext')
    const second = await encryptString(key, 'same plaintext')
    expect(first.iv).not.toBe(second.iv)
    expect(first.ciphertext).not.toBe(second.ciphertext)
  })

  it('rejects a wrong password when unlocking', async () => {
    const { meta } = await createEncryptionMeta('the-real-password', TEST_ITERATIONS)
    await expect(unlockWithPassword('the-wrong-password', meta)).rejects.toThrow(
      /incorrect master password/i,
    )
  })

  it('unlocks with the correct password', async () => {
    const { meta, key } = await createEncryptionMeta('the-real-password', TEST_ITERATIONS)
    const unlocked = await unlockWithPassword('the-real-password', meta)
    const { ciphertext, iv } = await encryptString(key, 'secret note')
    await expect(decryptString(unlocked, iv, ciphertext)).resolves.toBe('secret note')
  })

  it('detects tampering with the ciphertext (AES-GCM authentication)', async () => {
    const { key } = await createEncryptionMeta('tamper-test-password', TEST_ITERATIONS)
    const { ciphertext, iv } = await encryptString(key, 'original value')

    // Flip one character of the base64 payload.
    const bytes = base64ToBytes(ciphertext)
    bytes[0] = bytes[0] ^ 0xff
    const tampered = bytesToBase64(bytes)

    await expect(decryptString(key, iv, tampered)).rejects.toThrow(/unable to decrypt/i)
  })

  it('never stores the password in the metadata', async () => {
    const secret = 'my-unique-password-1234'
    const { meta } = await createEncryptionMeta(secret, TEST_ITERATIONS)
    const serialised = JSON.stringify(meta)
    expect(serialised).not.toContain(secret)
    expect(meta.mode).toBe('encrypted')
    expect(meta.salt).toBeTruthy()
    expect(meta.verifier).toBeTruthy()
    expect(meta.verifierIv).toBeTruthy()
  })

  it('uses a unique random salt per installation', async () => {
    const first = await createEncryptionMeta('same-password-here', TEST_ITERATIONS)
    const second = await createEncryptionMeta('same-password-here', TEST_ITERATIONS)
    expect(first.meta.salt).not.toBe(second.meta.salt)
  })

  it('verifies a stored verifier blob', async () => {
    const { meta, key } = await createEncryptionMeta('verifier-password', TEST_ITERATIONS)
    await expect(checkVerifier(key, meta.verifier, meta.verifierIv)).resolves.toBe(true)
    const other = await createEncryptionMeta('different-password', TEST_ITERATIONS)
    await expect(checkVerifier(other.key, meta.verifier, meta.verifierIv)).resolves.toBe(false)
  })

  it('hashes deterministically with SHA-256 and compares safely', async () => {
    const a = await sha256Hex('hello')
    const b = await sha256Hex('hello')
    const c = await sha256Hex('hello!')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toHaveLength(64)
    expect(safeEqual(a, b)).toBe(true)
    expect(safeEqual(a, c)).toBe(false)
  })

  it('round-trips base64 byte conversions including non-ASCII', async () => {
    const bytes = new TextEncoder().encode('शर्मा इलेक्ट्रिकल्स — 電気店')
    expect(new TextDecoder().decode(base64ToBytes(bytesToBase64(bytes)))).toBe(
      'शर्मा इलेक्ट्रिकल्स — 電気店',
    )
  })
})
