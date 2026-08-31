/// <reference types="vite/client" />

interface ImportMetaEnv {
  // URL du worker Cloudflare de synchronisation (voir worker/README.md).
  // Absente = fonctionnalité masquée, pas d'appel réseau.
  readonly VITE_SYNC_WORKER_URL?: string;
}
