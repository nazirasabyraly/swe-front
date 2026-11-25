/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin, e.g. "https://api.biletflow.local". Empty = same origin. */
  readonly VITE_API_BASE_URL?: string;
  /** "true" serves every API call from the in-browser mocks in src/api/mocks. */
  readonly VITE_USE_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
