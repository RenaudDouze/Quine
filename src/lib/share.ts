import { buildCells, type Cell, type Grid } from "./bingo";
import { uid } from "./storage";
import { now } from "./time";

/** Déclenche le téléchargement d'un blob sous le nom de fichier donné. */
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Déclenche le téléchargement d'un fichier JSON contenant toutes les grilles
 * (état complet, cases cochées comprises — pour restaurer sur un autre appareil). */
export function downloadBackup(grids: Grid[]) {
  const blob = new Blob([JSON.stringify(grids, null, 2)], { type: "application/json" });
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `bingo-sauvegarde-${date}.json`);
}

function isValidGrid(value: unknown): value is Partial<Grid> {
  // Stryker disable next-line ConditionalExpression: equivalent mutant — the
  // only inputs reachable here come from JSON.parse (object/array/string/
  // number/boolean/null), and none of the non-object primitives ever expose
  // .title/.items, so the check below rejects them just the same either way.
  if (!value || typeof value !== "object") return false;
  const g = value as Record<string, unknown>;
  return typeof g.title === "string" && Array.isArray(g.items);
}

function normalizeCell(raw: unknown): Cell {
  const c = (raw ?? {}) as Partial<Cell>;
  return {
    label: typeof c.label === "string" ? c.label : "",
    free: !!c.free,
    marked: !!c.marked,
  };
}

/** Complète les champs manquants et régénère un id pour éviter les collisions.
 * Régénère aussi les cases si elles sont absentes ou de la mauvaise taille
 * (ex : ancien format, fichier édité à la main). */
function normalizeGrid(raw: Partial<Grid>): Grid {
  const size = typeof raw.size === "number" && raw.size > 0 ? raw.size : 3;
  const items = Array.isArray(raw.items) ? raw.items.filter((i): i is string => typeof i === "string") : [];
  const freeCenter = !!raw.freeCenter;
  const cells =
    Array.isArray(raw.cells) && raw.cells.length === size * size
      ? raw.cells.map(normalizeCell)
      : buildCells(items, size, freeCenter);
  const timestamp = now();

  return {
    id: uid(),
    title: (raw.title || "").trim() || "Grille de bingo",
    size,
    freeCenter,
    items,
    cells,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : timestamp,
    updatedAt: timestamp,
  };
}

/** Parse un fichier JSON exporté. Retourne null si le contenu n'est pas valide. */
export function parseBackupJson(text: string): Grid[] | null {
  try {
    const data = JSON.parse(text);
    // Pas de vérification explicite Array.isArray : un `data` qui n'est pas
    // un tableau (objet, nombre...) fait échouer `.filter` juste en dessous,
    // ce qui est intercepté par le catch et retourne null tout de même.
    const valid = data.filter(isValidGrid);
    if (valid.length === 0) return null;
    return valid.map(normalizeGrid);
  } catch {
    return null;
  }
}

// Format compact utilisé pour le lien/QR code : uniquement de quoi
// régénérer une grille "fraîche" (titre, taille, case libre, mots) —
// mélangée et non cochée côté destinataire. On partage un modèle à jouer,
// pas sa progression exacte (voir downloadBackup pour une sauvegarde
// complète avec les cases cochées).
interface CompactGrid {
  t: string;
  s: number;
  f?: 1;
  i: string[];
}

function toCompact(grid: Grid): CompactGrid {
  return {
    t: grid.title,
    s: grid.size,
    ...(grid.freeCenter ? { f: 1 } : {}),
    i: grid.items,
  };
}

function fromCompact(raw: CompactGrid): Grid {
  return normalizeGrid({
    title: raw.t,
    size: raw.s,
    freeCenter: raw.f === 1,
    items: raw.i,
  });
}

export function encodeGridsToParam(grids: Grid[]): string {
  const compact = grids.map(toCompact);
  const json = JSON.stringify(compact);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  // Les caractères `=` de bourrage base64 n'apparaissent jamais qu'en fin de
  // chaîne : pas besoin d'ancrer `$` explicitement.
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+/, "");
}

export function decodeGridsFromParam(param: string): Grid[] | null {
  try {
    const base64 = param.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const compact = JSON.parse(json) as CompactGrid[];
    // Idem : un `compact` qui n'est pas un tableau fait échouer `.map`,
    // intercepté par le catch ci-dessous (retourne null dans les deux cas).
    return compact.map(fromCompact);
  } catch {
    return null;
  }
}

export function buildShareUrl(grids: Grid[]): string {
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.set("import", encodeGridsToParam(grids));
  return url.toString();
}
