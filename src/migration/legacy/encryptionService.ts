/**
 * Client-side encryption primitives.
 *
 * Design decisions (documented for the security section of the README):
 *  - Key derivation: PBKDF2-SHA256 with a 16-byte random salt per installation
 *    and a work factor of at least 600,000 iterations.
 *  - Confidentiality + integrity: AES-GCM 256 with a FRESH random 12-byte IV for
 *    every single encryption operation. An IV is never reused with the same key.
 *  - The master password is never stored. A small "verifier" blob is encrypted
 *    with the derived key so the app can tell a correct password from a wrong
 *    one without persisting the password itself.
 *  - The derived key lives in a module-level variable (memory) for the duration
 *    of an unlocked session and is dropped on lock. JavaScript cannot guarantee
 *    memory erasure, so this is best-effort only - stated honestly in the UI.
 */
import type { EncryptionMeta } from '@/types'
import { ENCRYPTION_ENVELOPE_VERSION } from '@/types'

/** Minimum work factor. The Settings UI cannot go below this. */
export const PBKDF2_MIN_ITERATIONS = 600_000

/** Default work factor, overridable at build time. */
export const PBKDF2_DEFAULT_ITERATIONS = (() => {
  const fromEnv = Number(import.meta.env?.VITE_PBKDF2_ITERATIONS)
  if (Number.isFinite(fromEnv) && fromEnv >= PBKDF2_MIN_ITERATIONS) return Math.floor(fromEnv)
  return PBKDF2_MIN_ITERATIONS
})()

const SALT_BYTES = 16
const IV_BYTES = 12
const VERIFIER_PLAINTEXT = 'my-visited-shops::verifier::v1'

/* ------------------------------------------------------------------ */
/* Byte / base64 helpers (work in the browser and in Node for tests)   */
/* ------------------------------------------------------------------ */

function getCrypto(): Crypto {
  const c = globalThis.crypto
  if (!c || !c.subtle) {
    throw new Error(
      'Web Crypto is not available in this context. Encryption requires a secure origin (https) or localhost.',
    )
  }
  return c
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  getCrypto().getRandomValues(bytes)
  return bytes
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

/* ------------------------------------------------------------------ */
/* Key derivation                                                      */
/* ------------------------------------------------------------------ */

export async function deriveKey(
  password: string,
  saltBase64: string,
  iterations: number = PBKDF2_DEFAULT_ITERATIONS,
): Promise<CryptoKey> {
  if (!password) throw new Error('A master password is required.')
  if (iterations < PBKDF2_MIN_ITERATIONS) {
    throw new Error(`PBKDF2 iterations must be at least ${PBKDF2_MIN_ITERATIONS}.`)
  }

  const subtle = getCrypto().subtle
  const baseKey = await subtle.importKey(
    'raw',
    utf8Encode(password) as unknown as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64ToBytes(saltBase64) as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable: the raw key material cannot be read back out
    ['encrypt', 'decrypt'],
  )
}

/* ------------------------------------------------------------------ */
/* Encrypt / decrypt                                                   */
/* ------------------------------------------------------------------ */

export interface CipherResult {
  /** base64 ciphertext (includes the GCM authentication tag). */
  ciphertext: string
  /** base64 of the unique IV used for this operation. */
  iv: string
}

export async function encryptString(key: CryptoKey, plaintext: string): Promise<CipherResult> {
  const iv = randomBytes(IV_BYTES)
  const subtle = getCrypto().subtle
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource, tagLength: 128 },
    key,
    utf8Encode(plaintext) as unknown as BufferSource,
  )
  return { ciphertext: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) }
}

/**
 * Decrypt a value. Throws a friendly, non-leaking error when the key is wrong or
 * the ciphertext was tampered with (AES-GCM authentication failure).
 */
export async function decryptString(
  key: CryptoKey,
  ivBase64: string,
  ciphertextBase64: string,
): Promise<string> {
  const subtle = getCrypto().subtle
  try {
    const plain = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(ivBase64) as unknown as BufferSource,
        tagLength: 128,
      },
      key,
      base64ToBytes(ciphertextBase64) as unknown as BufferSource,
    )
    return utf8Decode(new Uint8Array(plain))
  } catch {
    // Do not include any ciphertext / key detail in the message.
    throw new Error('Unable to decrypt this record. The password may be wrong or the data is damaged.')
  }
}

export async function encryptJson<T>(key: CryptoKey, value: T): Promise<CipherResult> {
  return encryptString(key, JSON.stringify(value))
}

export async function decryptJson<T>(
  key: CryptoKey,
  ivBase64: string,
  ciphertextBase64: string,
): Promise<T> {
  const text = await decryptString(key, ivBase64, ciphertextBase64)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Decrypted data is not valid JSON - the record appears to be corrupted.')
  }
}

/* ------------------------------------------------------------------ */
/* Password verifier                                                   */
/* ------------------------------------------------------------------ */

export async function createVerifier(key: CryptoKey): Promise<{ verifier: string; verifierIv: string }> {
  const { ciphertext, iv } = await encryptString(key, VERIFIER_PLAINTEXT)
  return { verifier: ciphertext, verifierIv: iv }
}

/** Returns true when the supplied key decrypts the stored verifier blob. */
export async function checkVerifier(
  key: CryptoKey,
  verifier: string | undefined,
  verifierIv: string | undefined,
): Promise<boolean> {
  if (!verifier || !verifierIv) return false
  try {
    const text = await decryptString(key, verifierIv, verifier)
    return text === VERIFIER_PLAINTEXT
  } catch {
    return false
  }
}

/** Build fresh encryption metadata for a new encrypted installation. */
export async function createEncryptionMeta(
  password: string,
  iterations: number = PBKDF2_DEFAULT_ITERATIONS,
): Promise<{ meta: EncryptionMeta; key: CryptoKey }> {
  const salt = bytesToBase64(randomBytes(SALT_BYTES))
  const key = await deriveKey(password, salt, iterations)
  const { verifier, verifierIv } = await createVerifier(key)

  return {
    key,
    meta: {
      mode: 'encrypted',
      salt,
      iterations,
      verifier,
      verifierIv,
      createdAt: new Date().toISOString(),
      version: ENCRYPTION_ENVELOPE_VERSION,
    },
  }
}

/** Unlock: derive the key from the stored salt and check it against the verifier. */
export async function unlockWithPassword(
  password: string,
  meta: EncryptionMeta,
): Promise<CryptoKey> {
  if (meta.mode !== 'encrypted' || !meta.salt) {
    throw new Error('This device is not configured for encrypted storage.')
  }
  const key = await deriveKey(password, meta.salt, meta.iterations ?? PBKDF2_DEFAULT_ITERATIONS)
  const ok = await checkVerifier(key, meta.verifier, meta.verifierIv)
  if (!ok) {
    throw new Error('Incorrect master password.')
  }
  return key
}

/** SHA-256 as lowercase hex, used for backup integrity checks. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await getCrypto().subtle.digest('SHA-256', utf8Encode(text) as unknown as BufferSource)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Constant-time-ish comparison for hex digests. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/* ------------------------------------------------------------------ */
/* In-memory session key (cleared on lock)                             */
/* ------------------------------------------------------------------ */

let sessionKey: CryptoKey | null = null

export function setSessionKey(key: CryptoKey | null): void {
  sessionKey = key
}

export function getSessionKey(): CryptoKey | null {
  return sessionKey
}

export function hasSessionKey(): boolean {
  return sessionKey !== null
}

export function clearSessionKey(): void {
  sessionKey = null
}
