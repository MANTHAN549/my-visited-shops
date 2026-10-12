import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Vite configuration.
 *
 * The public base path is read from the `VITE_BASE_PATH` environment variable so
 * the same code base can be deployed either at a domain root ("/") or under a
 * GitHub Pages project sub-path ("/my-visited-shops/").
 *
 *   npm run build                                    -> base "/"
 *   VITE_BASE_PATH=/my-visited-shops/ npm run build   -> base "/my-visited-shops/"
 *
 * The app uses hash based routing (HashRouter) so no server side rewrite rules
 * are required on GitHub Pages.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE_PATH || '/'

  return {
    base,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,
        includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'My Visited Shops',
          short_name: 'Visited Shops',
          description:
            'Save the shops you visit, keep their GPS coordinates and contacts, and navigate back to them any time. Works offline and stores everything on your device.',
          theme_color: '#0f766e',
          background_color: '#f8fafc',
          display: 'standalone',
          orientation: 'portrait-primary',
          categories: ['travel', 'navigation', 'productivity', 'utilities'],
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Only static application assets are pre-cached. User records live in
          // IndexedDB and are never written to the Service Worker cache.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
          navigateFallback: `${base}index.html`,
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          clientsClaim: false,
          skipWaiting: false,
          runtimeCaching: [
            {
              // OpenStreetMap raster tiles. Previously visited areas stay visible
              // offline; anything never loaded before still needs a connection.
              urlPattern: /^https:\/\/[abc]?\.?tile\.openstreetmap\.org\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'osm-tiles',
                expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/[abc]?\.?tile\.opentopomap\.org\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'osm-tiles-alt',
                expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    server: {
      host: true,
      port: 5173,
    },
    preview: {
      host: true,
      port: 4173,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      target: 'es2022',
      chunkSizeWarningLimit: 1500,
    },
    test: {
      globals: false,
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  }
})
