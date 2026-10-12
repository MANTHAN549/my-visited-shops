import { base64ToBytes, bytesToBase64, decryptString, deriveKey, encryptString, randomBytes } from './encryptionService'

export interface CloudKeyring {
  version: 1
  salt: string
  iterations: number
  wrappedKey: string
  wrapIv: string
  recoverySalt: string
  recoveryWrappedKey: string
  recoveryIv: string
}

let cloudKey: CryptoKey | null = null
const ITERATIONS = 600_000

export function hasCloudKey(): boolean { return cloudKey !== null }
export function clearCloudKey(): void { cloudKey = null }

async function wrapKey(secret: string, salt: string, raw: Uint8Array) {
  const wrappingKey = await deriveKey(secret, salt, ITERATIONS)
  return encryptString(wrappingKey, bytesToBase64(raw))
}

async function unwrapKey(secret: string, salt: string, iv: string, ciphertext: string): Promise<CryptoKey> {
  const wrappingKey = await deriveKey(secret, salt, ITERATIONS)
  const rawBase64 = await decryptString(wrappingKey, iv, ciphertext)
  const raw = base64ToBytes(rawBase64)
  return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
}

export async function createCloudKeyring(passphrase: string): Promise<{ keyring: CloudKeyring; recoveryCode: string }> {
  if (passphrase.length < 12) throw new Error('Use a cloud encryption passphrase with at least 12 characters.')
  const raw = randomBytes(32)
  const recoveryBytes = randomBytes(32)
  const recoveryCode = bytesToBase64(recoveryBytes)
  const salt = bytesToBase64(randomBytes(16))
  const recoverySalt = bytesToBase64(randomBytes(16))
  const passWrap = await wrapKey(passphrase, salt, raw)
  const recoveryWrap = await wrapKey(recoveryCode, recoverySalt, raw)
  cloudKey = await crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
  return {
    keyring: {
      version: 1, salt, iterations: ITERATIONS, wrappedKey: passWrap.ciphertext, wrapIv: passWrap.iv,
      recoverySalt, recoveryWrappedKey: recoveryWrap.ciphertext, recoveryIv: recoveryWrap.iv,
    },
    recoveryCode,
  }
}

export async function unlockCloudKeyring(keyring: CloudKeyring, secret: string, recovery = false): Promise<void> {
  cloudKey = await unwrapKey(
    secret,
    recovery ? keyring.recoverySalt : keyring.salt,
    recovery ? keyring.recoveryIv : keyring.wrapIv,
    recovery ? keyring.recoveryWrappedKey : keyring.wrappedKey,
  )
}

export async function rewrapCloudKeyring(keyring: CloudKeyring, currentSecret: string, nextPassphrase: string) {
  if (nextPassphrase.length < 12) throw new Error('Use a cloud encryption passphrase with at least 12 characters.')
  const key = await unwrapKey(currentSecret, keyring.salt, keyring.wrapIv, keyring.wrappedKey)
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key))
  const salt = bytesToBase64(randomBytes(16))
  const wrapped = await wrapKey(nextPassphrase, salt, raw)
  return { ...keyring, salt, wrappedKey: wrapped.ciphertext, wrapIv: wrapped.iv }
}

export async function changeCloudPassphrase(keyring: CloudKeyring, nextPassphrase: string): Promise<CloudKeyring> {
  if (!cloudKey) throw new Error('Unlock cloud encryption before changing its passphrase.')
  if (nextPassphrase.length < 12) throw new Error('Use a cloud encryption passphrase with at least 12 characters.')
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', cloudKey))
  const salt = bytesToBase64(randomBytes(16))
  const wrapped = await wrapKey(nextPassphrase, salt, raw)
  return { ...keyring, salt, wrappedKey: wrapped.ciphertext, wrapIv: wrapped.iv }
}

export async function encryptCloudJson(value: unknown): Promise<{ ciphertext: string; iv: string }> {
  if (!cloudKey) throw new Error('Unlock cloud encryption before synchronizing.')
  return encryptString(cloudKey, JSON.stringify(value))
}

export async function decryptCloudJson<T>(ciphertext: string, iv: string): Promise<T> {
  if (!cloudKey) throw new Error('Unlock cloud encryption before synchronizing.')
  return JSON.parse(await decryptString(cloudKey, iv, ciphertext)) as T
}
