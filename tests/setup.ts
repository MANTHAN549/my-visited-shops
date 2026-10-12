/**
 * Vitest setup.
 *
 * - `fake-indexeddb` gives the Dexie layer a real IndexedDB implementation in Node.
 * - Web Crypto is taken from Node's implementation when the test environment does
 *   not expose `globalThis.crypto.subtle` (jsdom does not).
 * - `localStorage` / `sessionStorage` shims keep the hooks importable.
 */
import 'fake-indexeddb/auto'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  })
}

if (!globalThis.structuredClone) {
  // Node 18+ provides structuredClone; this is a safety net only.
  globalThis.structuredClone = (value: unknown) => JSON.parse(JSON.stringify(value))
}

// jsdom provides localStorage, but a few environments leave it undefined.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  const shim = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: shim, configurable: true })
  Object.defineProperty(globalThis, 'sessionStorage', { value: shim, configurable: true })
}
