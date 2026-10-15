/**
 * Generates the PWA icon set from a single vector definition.
 *
 * Run with:  npm run icons
 *
 * Produces:
 *   public/icons/icon-192.png
 *   public/icons/icon-512.png
 *   public/icons/icon-maskable-512.png  (extra padding for Android mask cropping)
 *   public/icons/apple-touch-icon.png
 *   public/favicon.ico                  (32px PNG, named .ico for browsers)
 *
 * Committing the generated PNGs keeps the repository installable without running
 * this script, which matters for deployment installs.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'public/icons')

/** The mark: a teal rounded square with a white map pin. */
function svg(size, padding = 0) {
  const inner = size - padding * 2
  const scale = inner / 64
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#14b8a6"/>
      <stop offset="1" stop-color="#0f766e"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="url(#g)"/>
  <g transform="translate(${padding} ${padding}) scale(${scale})">
    <path d="M32 13c-7.18 0-13 5.82-13 13 0 9.1 11.4 22.3 12.36 23.4a.86.86 0 0 0 1.28 0C33.6 48.3 45 35.1 45 26c0-7.18-5.82-13-13-13Z" fill="#ffffff"/>
    <circle cx="32" cy="26" r="5.2" fill="#0f766e"/>
  </g>
</svg>`
}

async function main() {
  await mkdir(outDir, { recursive: true })

  const targets = [
    { file: 'icon-192.png', size: 192, padding: 0 },
    { file: 'icon-512.png', size: 512, padding: 0 },
    // Maskable icons need their content inside a safe circle: ~20% padding.
    { file: 'icon-maskable-512.png', size: 512, padding: 96 },
    { file: 'apple-touch-icon.png', size: 180, padding: 0 },
  ]

  for (const target of targets) {
    const buffer = await sharp(Buffer.from(svg(target.size, target.padding)))
      .png({ compressionLevel: 9 })
      .toBuffer()
    await writeFile(resolve(outDir, target.file), buffer)
    console.log(`wrote public/icons/${target.file} (${buffer.length} bytes)`)
  }

  // favicon.ico is written as a PNG payload, which every current browser accepts.
  const favicon = await sharp(Buffer.from(svg(64, 0))).png().toBuffer()
  await writeFile(resolve(root, 'public/favicon.ico'), favicon)
  console.log(`wrote public/favicon.ico (${favicon.length} bytes)`)
}

main().catch((error) => {
  console.error('Icon generation failed:', error)
  process.exit(1)
})
