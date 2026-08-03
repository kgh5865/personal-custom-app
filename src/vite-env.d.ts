/// <reference types="svelte" />
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_UPDATE_REPO?: string; // e.g. "owner/repo" for GitHub Releases auto-update
  readonly VITE_OPENCLAW_URL?: string;
  readonly VITE_OPENCLAW_TOKEN?: string;
  readonly VITE_OPENCLAW_MODEL?: string;
}
