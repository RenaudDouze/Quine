import { generateSyncCode, isValidSyncCode, normalizeSyncCode } from "./code";

export interface Env {
  SYNC_KV: KVNamespace;
  ALLOWED_ORIGIN?: string;
}

/** État stocké côté serveur (réponse GET/PUT) : `version` est un compteur
 * entier propre au serveur, incrémenté à chaque écriture acceptée. */
export interface SyncState {
  version: number;
  grids: unknown[];
}

/** Corps d'une requête PUT : `baseVersion` est la version que le client
 * pensait être la version courante au moment de pousser (obtenue via un GET
 * ou un PUT précédent), jamais une horloge. Comparer des horodatages entre
 * appareils suppose des horloges synchronisées, ce qui n'est pas garanti (une
 * horloge en retard suffit à faire rejeter à tort des poussées légitimes, ou
 * pire, à faire accepter une poussée plus ancienne comme si elle était plus
 * récente) : la comparaison d'égalité stricte sur un entier attribué par le
 * serveur ne dépend d'aucune horloge cliente. */
export interface PushRequest {
  baseVersion: number;
  grids: unknown[];
}

// Largement suffisant pour une liste de grilles (même avec leurs cases) ;
// borne la taille acceptée plutôt que de laisser un client remplir le KV
// sans limite.
const MAX_BODY_BYTES = 256 * 1024;
// Un code inutilisé pendant 180 jours libère sa place plutôt que de rester
// indéfiniment dans le stockage.
const KV_TTL_SECONDS = 60 * 60 * 24 * 180;

// Fenêtre fixe par IP : à défaut d'Object Durable (non provisionné dans ce
// projet, juste un espace KV), un compteur en KV par IP/fenêtre suffit à
// dissuader un abus scripté (création de codes ou poussées en boucle) sans
// gêner un usage normal — le sondage côté client (useRemoteSync.ts) tourne
// toutes les 20s, largement sous ce seuil même en comptant les poussées
// ponctuelles.
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const RATE_LIMIT_MAX_REQUESTS = 60;

/** Cloudflare pose toujours cet en-tête sur les requêtes qui atteignent le
 * worker (absent seulement hors de ce runtime, ex : tests) : une IP absente
 * retombe sur un compartiment commun plutôt que d'échouer. */
function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

/** `true` si `ip` a déjà atteint son quota de requêtes pour la fenêtre en
 * cours. Compteur best-effort : la paire lecture-puis-écriture n'est pas
 * atomique (deux requêtes concurrentes peuvent toutes deux lire le même
 * compte avant d'écrire), un léger dépassement reste possible sous forte
 * concurrence — acceptable pour de la dissuasion d'abus, pas une garantie
 * stricte de facturation. */
async function isRateLimited(env: Env, ip: string): Promise<boolean> {
  const windowStart = Math.floor(Date.now() / 1000 / RATE_LIMIT_WINDOW_SECONDS) * RATE_LIMIT_WINDOW_SECONDS;
  const key = `ratelimit:${ip}:${windowStart}`;
  const current = Number((await env.SYNC_KV.get(key)) ?? "0");
  if (current >= RATE_LIMIT_MAX_REQUESTS) return true;
  // expirationTtl minimal de Cloudflare KV : 60s, toujours atteint ici même
  // pour une fenêtre plus courte.
  await env.SYNC_KV.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS + 5 });
  return false;
}

export function kvKey(code: string): string {
  return `sync:${code}`;
}

export function isValidPushRequest(value: unknown): value is PushRequest {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.baseVersion === "number" && Array.isArray(v.grids);
}

/** Ramène `ALLOWED_ORIGIN` à un schéma+hôte nu (jamais de chemin ni de slash
 * final) : c'est tout ce qu'un en-tête `Access-Control-Allow-Origin` accepte,
 * un navigateur rejette silencieusement toute valeur qui contient un chemin
 * (ex : collé depuis l'URL complète du site plutôt que juste son origine) —
 * bloquant alors *toutes* les requêtes vers le worker sans qu'aucune erreur
 * ne s'affiche côté app. Une valeur absente ou mal formée retombe sur '*'. */
function normalizedAllowedOrigin(env: Env): string {
  if (!env.ALLOWED_ORIGIN || env.ALLOWED_ORIGIN === "*") return "*";
  try {
    return new URL(env.ALLOWED_ORIGIN).origin;
  } catch {
    return "*";
  }
}

function corsHeaders(env: Env): HeadersInit {
  return {
    "Access-Control-Allow-Origin": normalizedAllowedOrigin(env),
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(body: unknown, init: ResponseInit, env: Env): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...corsHeaders(env), ...(init.headers ?? {}) },
  });
}

// Collisions astronomiquement improbables (29^8 ≈ 500 milliards de
// combinaisons) : quelques essais suffisent largement à s'en prémunir sans
// jamais boucler longtemps.
const CREATE_ATTEMPTS = 5;

async function handleCreate(env: Env): Promise<Response> {
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const code = generateSyncCode();
    const existing = await env.SYNC_KV.get(kvKey(code));
    if (existing !== null) continue;
    // version 0 = « rien poussé encore » : le premier PUT doit fournir
    // baseVersion 0 pour réussir (voir handlePut).
    const state: SyncState = { version: 0, grids: [] };
    await env.SYNC_KV.put(kvKey(code), JSON.stringify(state), { expirationTtl: KV_TTL_SECONDS });
    return json({ code }, { status: 201 }, env);
  }
  return json({ error: "Impossible de générer un code, réessaie." }, { status: 500 }, env);
}

async function handleGet(env: Env, code: string): Promise<Response> {
  const stored = await env.SYNC_KV.get(kvKey(code));
  if (stored === null) return json({ error: "Code inconnu." }, { status: 404 }, env);
  return json(JSON.parse(stored), { status: 200 }, env);
}

async function handlePut(request: Request, env: Env, code: string): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: "Trop volumineux." }, { status: 413 }, env);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "JSON invalide." }, { status: 400 }, env);
  }
  if (!isValidPushRequest(payload)) {
    return json({ error: "Format invalide (baseVersion et grids requis)." }, { status: 400 }, env);
  }

  const existingRaw = await env.SYNC_KV.get(kvKey(code));
  const existing: SyncState | null = existingRaw ? JSON.parse(existingRaw) : null;
  const currentVersion = existing?.version ?? 0;

  // Écriture optimiste façon « compare-and-swap » : la poussée n'est acceptée
  // que si le client est bien parti de la dernière version connue du
  // serveur. Un entier attribué par le serveur (jamais une horloge cliente)
  // rend la comparaison fiable même si l'horloge d'un appareil dérive —
  // contrairement à un horodatage, un décalage d'horloge ne peut ni faire
  // rejeter à tort une poussée légitime, ni faire accepter une poussée
  // périmée comme si elle était la plus récente.
  if (payload.baseVersion !== currentVersion) {
    return json(existing ?? { version: 0, grids: [] }, { status: 409 }, env);
  }

  const next: SyncState = { version: currentVersion + 1, grids: payload.grids };
  await env.SYNC_KV.put(kvKey(code), JSON.stringify(next), { expirationTtl: KV_TTL_SECONDS });
  return json(next, { status: 200 }, env);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (await isRateLimited(env, clientIp(request))) {
      return json(
        { error: "Trop de requêtes, réessaie dans un instant." },
        { status: 429, headers: { "Retry-After": String(RATE_LIMIT_WINDOW_SECONDS) } },
        env
      );
    }

    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);

    if (segments[0] !== "api" || segments[1] !== "sync") {
      return json({ error: "Not found" }, { status: 404 }, env);
    }

    if (segments.length === 2) {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 }, env);
      return handleCreate(env);
    }

    if (segments.length === 3) {
      const code = normalizeSyncCode(segments[2]);
      if (!isValidSyncCode(code)) return json({ error: "Code invalide." }, { status: 400 }, env);
      if (request.method === "GET") return handleGet(env, code);
      if (request.method === "PUT") return handlePut(request, env, code);
      return json({ error: "Method not allowed" }, { status: 405 }, env);
    }

    return json({ error: "Not found" }, { status: 404 }, env);
  },
};
