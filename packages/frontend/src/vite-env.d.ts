/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ODIN_APP_NAME?: string;
  readonly VITE_ODIN_ENV?: 'prod' | 'dev' | 'local';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
