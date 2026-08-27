import type { Grid } from "./bingo";
import { triggerDownload } from "./download";

const CELL_SIZE = 120;
const GAP = 8;
const PADDING = 24;
const TITLE_HEIGHT = 60;
// Repli quand la grille n'a pas de couleur propre (voir index.css : --accent
// suit la même règle, le bleu du CTA plutôt qu'une couleur de marque fixe).
const DEFAULT_ACCENT = "#2563eb";
// Même dosage que color-mix(in srgb, var(--accent) 18%, var(--surface)) en
// CSS pour la case "GRATUIT" : non réutilisable ici tel quel, ce fichier
// produit un SVG autonome destiné à être ouvert hors navigateur (imprimante,
// visionneuse d'images...), où color-mix() n'est pas garanti disponible.
const FREE_CELL_TINT_RATIO = 0.18;

/** Échappe les caractères spéciaux XML pour une insertion sûre dans le SVG. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Mélange une couleur hex avec du blanc dans la proportion `ratio` (0 = blanc
 * pur, 1 = couleur pure) — l'équivalent, calculé une fois pour un fichier SVG
 * statique, de color-mix(in srgb, <couleur> <ratio>%, white) en CSS. */
function tintWithWhite(hex: string, ratio: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const mix = (channel: number) => Math.round(channel * ratio + 255 * (1 - ratio));
  // Stryker disable next-line StringLiteral: avec FREE_CELL_TINT_RATIO fixé à
  // 0.18, chaque canal mélangé reste toujours >= 209 (255 * 0.82 au minimum),
  // donc toujours codé sur 2 chiffres hexadécimaux — le padStart ne s'active
  // jamais dans ce domaine, mais reste là pour rester correct si le ratio
  // changeait un jour.
  return `#${[r, g, b].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}

/** Construit un SVG autonome (vectoriel, imprimable à n'importe quelle
 * taille) représentant la grille telle qu'affichée à l'écran — titre, cases
 * cochées et couleur personnalisée comprises. Fonction pure : pas d'accès au
 * DOM, entièrement testable sans navigateur. */
export function buildGridSvg(grid: Grid): string {
  const n = grid.size;
  const accent = grid.color || DEFAULT_ACCENT;
  const freeCellFill = tintWithWhite(accent, FREE_CELL_TINT_RATIO);
  const boardSize = n * CELL_SIZE + (n - 1) * GAP;
  const width = boardSize + PADDING * 2;
  const height = boardSize + PADDING * 2 + TITLE_HEIGHT;

  const cells = grid.cells
    .map((cell, i) => {
      const row = Math.floor(i / n);
      const col = i % n;
      const x = PADDING + col * (CELL_SIZE + GAP);
      const y = PADDING + TITLE_HEIGHT + row * (CELL_SIZE + GAP);
      const fill = cell.marked ? accent : cell.free ? freeCellFill : "#ffffff";
      const textColor = cell.marked ? "#ffffff" : cell.free ? accent : "#0f172a";
      const label = escapeXml(cell.label);

      return `<rect x="${x}" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="14" fill="${fill}" stroke="#e2e8f0" stroke-width="2" /><foreignObject x="${x + 6}" y="${y + 6}" width="${CELL_SIZE - 12}" height="${CELL_SIZE - 12}"><div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;text-align:center;height:100%;font:600 14px system-ui,sans-serif;color:${textColor};overflow:hidden;">${label}</div></foreignObject>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff" /><text x="${width / 2}" y="${PADDING + 30}" text-anchor="middle" style="font: 700 26px system-ui, sans-serif; fill:#0f172a;">${escapeXml(grid.title)}</text>${cells}</svg>`;
}

/** Nom de fichier sûr dérivé du titre de la grille (mêmes règles que pour un
 * export CSV/JSON : caractères non alphanumériques remplacés par un tiret). */
function slugify(title: string): string {
  return title.replace(/[^a-zA-Z0-9-_]+/g, "-") || "grille";
}

/** Déclenche le téléchargement de la grille sous forme d'image SVG (fond
 * blanc, vectorielle donc imprimable sans perte de qualité). */
export function downloadGridSvg(grid: Grid) {
  const svg = buildGridSvg(grid);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  triggerDownload(blob, `${slugify(grid.title)}.svg`);
}
