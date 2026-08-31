import type { Grid } from "./bingo";

// Même alphabet que worker/src/code.ts (dupliqué volontairement : l'app et
// le worker sont deux projets déployés séparément, sans étape de build
// partagée — ces quelques lignes ne valent pas la complexité d'un package
// commun).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTWXYZ23456789";
const CODE_LENGTH = 8;

/** État renvoyé par le worker (GET/PUT) : `version` est un entier attribué
 * par le serveur, incrémenté à chaque écriture acceptée — jamais une horloge
 * (voir `PushRequest` pour pourquoi). */
export interface SyncState {
  version: number;
  grids: Grid[];
}

/** Corps d'une requête PUT : `baseVersion` est la version que ce client
 * pensait être la version courante (dernière connue via un GET/PUT
 * précédent). Comparer des horodatages entre appareils suppose des horloges
 * synchronisées entre eux, ce qui n'est pas garanti — l'horloge d'un appareil
 * en retard suffit à faire rejeter à tort une poussée légitime, ou pire, à
 * faire accepter une poussée périmée comme si elle était la plus récente. Un
 * entier attribué par le serveur élimine ce risque : la comparaison
 * d'égalité stricte faite côté worker ne dépend d'aucune horloge cliente. */
export interface PushRequest {
  baseVersion: number;
  grids: Grid[];
}

/** Met un code saisi à la main (espaces, tirets, minuscules) au format
 * canonique attendu par le worker. */
export function normalizeSyncCode(raw: string): string {
  // Un remplacement global retire déjà les espaces/tirets en tête et en
  // queue (`\s` couvre les mêmes blancs que `.trim()`) : un `.trim()`
  // préalable, ou un `+` pour absorber une suite en un seul remplacement,
  // n'apporteraient rien d'observable.
  return raw.toUpperCase().replace(/[\s-]/g, "");
}

/** Un code normalisé valide fait exactement 8 caractères de l'alphabet
 * autorisé par le worker (voir worker/src/code.ts). Validé côté client avant
 * l'appel réseau, pour un retour immédiat sur un code mal recopié. */
export function isValidSyncCode(code: string): boolean {
  return new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(code);
}

/** Présentation lisible d'un code (`XXXX XXXX`), pour l'affichage uniquement
 * — le stockage et les appels réseau utilisent toujours la forme compacte. */
export function formatSyncCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

async function readJsonOrThrow(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("Réponse du serveur illisible.");
  }
}

/** Demande un nouveau code de synchronisation au worker. */
export async function createSyncCode(workerUrl: string): Promise<string> {
  const response = await fetch(`${workerUrl}/api/sync`, { method: "POST" });
  if (!response.ok) throw new Error("Impossible de créer un code de synchronisation.");
  const body = (await readJsonOrThrow(response)) as { code: string };
  return body.code;
}

/** Récupère l'état stocké pour un code. `null` si le code n'existe pas (ou
 * plus — voir l'expiration côté worker). */
export async function fetchSyncState(workerUrl: string, code: string): Promise<SyncState | null> {
  const response = await fetch(`${workerUrl}/api/sync/${code}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Impossible de récupérer les grilles synchronisées.");
  return (await readJsonOrThrow(response)) as SyncState;
}

export interface PushResult {
  /** `false` si `baseVersion` ne correspondait plus à la version stockée
   * (un autre appareil a poussé entre-temps, voir l'écriture optimiste du
   * worker) : `state` porte alors la version actuelle du serveur, à adopter
   * localement plutôt que réessayer avec le même `baseVersion`. */
  accepted: boolean;
  state: SyncState;
}

/** Pousse l'état local vers le worker. */
export async function pushSyncState(workerUrl: string, code: string, push: PushRequest): Promise<PushResult> {
  const response = await fetch(`${workerUrl}/api/sync/${code}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(push),
  });
  if (response.status === 409) return { accepted: false, state: (await readJsonOrThrow(response)) as SyncState };
  if (!response.ok) throw new Error("Impossible de synchroniser les grilles.");
  return { accepted: true, state: (await readJsonOrThrow(response)) as SyncState };
}
