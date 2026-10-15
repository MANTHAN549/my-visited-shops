const MIN_ITERATIONS = 600_000
function webCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto requires HTTPS or localhost.')
  return globalThis.crypto
}
export function randomBytes(length: number): Uint8Array { return webCrypto().getRandomValues(new Uint8Array(length)) }
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value), bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}
export async function deriveKey(passphrase: string, salt: string, iterations = MIN_ITERATIONS): Promise<CryptoKey> {
  if (!passphrase) throw new Error('Enter the GitHub data passphrase to unlock your data.')
  if (iterations < MIN_ITERATIONS) throw new Error('PBKDF2 iterations must be at least 600,000.')
  const crypto = webCrypto()
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase) as unknown as BufferSource, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: base64ToBytes(salt) as unknown as BufferSource, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
export async function encryptString(key: CryptoKey, plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = randomBytes(12)
  const encrypted = await webCrypto().subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, new TextEncoder().encode(plaintext) as unknown as BufferSource)
  return { ciphertext: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) }
}
export async function decryptString(key: CryptoKey, iv: string, ciphertext: string): Promise<string> {
  try {
    const plain = await webCrypto().subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(iv) as unknown as BufferSource }, key, base64ToBytes(ciphertext) as unknown as BufferSource)
    return new TextDecoder().decode(plain)
  } catch { throw new Error('Wrong GitHub data passphrase, or encrypted data is damaged.') }
}
export function unicodeRoundTrip(value: string): string { return new TextDecoder().decode(new TextEncoder().encode(value)) }
export function base64RoundTrip(value: string): string { return new TextDecoder().decode(base64ToBytes(bytesToBase64(new TextEncoder().encode(value)))) }
