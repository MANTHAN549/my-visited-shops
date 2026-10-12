/**
 * Small maintenance helpers that do not belong to any single service.
 */

/**
 * Clear the Service Worker caches.
 *
 * Called when the user erases all local data: leaving cached map tiles behind
 * would keep a trace of the areas they looked at, which is exactly what "erase
 * everything" should remove.
 */
export async function resetAllCaches(): Promise<void> {
  try {
    if ('caches' in window) {
      const names = await caches.keys()
      await Promise.all(names.map((name) => caches.delete(name)))
    }
  } catch {
    // Cache API is unavailable (older browser or non-secure origin).
  }
}

/** True when the app is running as an installed PWA. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Copy text with a graceful fallback for browsers without the async clipboard API. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
