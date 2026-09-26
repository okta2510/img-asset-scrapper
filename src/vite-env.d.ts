/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly APP_SSCRIPT_URL?: string;
  readonly [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
