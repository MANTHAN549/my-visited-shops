import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { databasePlugin } from './server/databasePlugin.ts'

export default defineConfig(() => {
  return {
    base: '/',
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      databasePlugin(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,
        includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'My Visited Shops',
          short_name: 'Visited Shops',
          description:
            'Track shops and visits. Encrypted data is stored in the local project database.',
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
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          clientsClaim: false,
          skipWaiting: false,
          runtimeCaching: [
            {
              // The local file API serves encrypted user data and must never enter Cache Storage.
              urlPattern: /\/api\/database(?:\?.*)?$/,
              handler: 'NetworkOnly',
            },
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
      host: '127.0.0.1',
      port: 5173,
    },
    preview: {
      host: '127.0.0.1',
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

