/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_OSRM_BASE_URL?: string
  readonly VITE_GEOCODING_BASE_URL?: string
  readonly VITE_TILE_URL?: string
  readonly VITE_PBKDF2_ITERATIONS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}
