import type { Grid } from "./bingo";
import { triggerDownload } from "./download";

const CELL_SIZE = 120;
const GAP = 8;
const PADDING = 24;
const TITLE_HEIGHT = 60;
const DEFAULT_ACCENT = "#7c3aed";

/** Échappe les caractères spéciaux XML pour une insertion sûre dans le SVG. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Construit un SVG autonome (vectoriel, imprimable à n'importe quelle
 * taille) représentant la grille telle qu'affichée à l'écran — titre, cases
 * cochées et couleur personnalisée comprises. Fonction pure : pas d'accès au
 * DOM, entièrement testable sans navigateur. */
export function buildGridSvg(grid: Grid): string {
  const n = grid.size;
  const accent = grid.color || DEFAULT_ACCENT;
  const boardSize = n * CELL_SIZE + (n - 1) * GAP;
  const width = boardSize + PADDING * 2;
  const height = boardSize + PADDING * 2 + TITLE_HEIGHT;

  const cells = grid.cells
    .map((cell, i) => {
      const row = Math.floor(i / n);
      const col = i % n;
      const x = PADDING + col * (CELL_SIZE + GAP);
      const y = PADDING + TITLE_HEIGHT + row * (CELL_SIZE + GAP);
      const fill = cell.marked ? accent : cell.free ? "#ede9fe" : "#ffffff";
      const textColor = cell.marked ? "#ffffff" : cell.free ? "#5b21b6" : "#0f172a";
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
