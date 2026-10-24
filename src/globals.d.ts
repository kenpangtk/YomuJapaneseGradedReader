/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHARED_PROVIDER?: string;
  readonly VITE_SHARED_API_KEY?: string;
  readonly VITE_SHARED_API_URL?: string;
  readonly VITE_SHARED_API_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
