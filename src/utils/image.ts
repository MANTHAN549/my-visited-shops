/**
 * Image helpers - shrink a chosen photo before it is saved in the encrypted GitHub document.
 *
 * Shop photos come from phone cameras and can be several megabytes. Storing them
 * raw would bloat the encrypted record and slow every decrypt, so images are
 * downscaled to a maximum edge of 1024 px and re-encoded as JPEG/WebP data URLs.
 */
const MAX_EDGE = 1024
const TARGET_QUALITY = 0.78
const MAX_SOURCE_BYTES = 20 * 1024 * 1024

export interface CompressedImage {
  dataUrl: string
  width: number
  height: number
  /** Approximate size of the encoded data URL in bytes. */
  bytes: number
}

export async function compressImageFile(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (JPEG, PNG, WebP or HEIC-converted JPEG).')
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('That image is larger than 20 MB. Please choose a smaller photo.')
  }

  const bitmap = await loadBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Your browser could not process this image.')

  context.drawImage(bitmap as CanvasImageSource, 0, 0, width, height)
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close()

  // Prefer WebP (smaller) and fall back to JPEG on older browsers.
  let dataUrl = canvas.toDataURL('image/webp', TARGET_QUALITY)
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', TARGET_QUALITY)
  }

  return { dataUrl, width, height, bytes: approximateBytes(dataUrl) }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // Fall through to the <img> path below.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('This image could not be opened.'))
      img.src = url
    })
  } finally {
    // The decoded image is kept in memory by the element, so the blob URL can go.
    setTimeout(() => URL.revokeObjectURL(url), 5_000)
  }
}

/** Base64 payload length -> bytes. */
export function approximateBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? ''
  return Math.round((base64.length * 3) / 4)
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

