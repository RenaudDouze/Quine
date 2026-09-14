import type { Cell, Grid } from "./bingo";
import { hexToRgb, isValidHexColor } from "./colors";
import { DEFAULT_ACCENT, FREE_CELL_TINT_RATIO, tintWithWhite } from "./gridImage";

// Type du document jsPDF, sans import statique du module (voir
// exportGridsAsPdf : chargé dynamiquement, seulement si l'export est
// effectivement déclenché) — `typeof import(...)` ne référence que les types,
// jamais le module lui-même au runtime.
type JsPdfDoc = InstanceType<typeof import("jspdf").jsPDF>;

const PAGE_MARGIN = 40;
const TITLE_AREA_HEIGHT = 50;
const CELL_GAP = 6;
const CELL_CORNER_RADIUS = 6;
const CELL_TEXT_PADDING = 10;
const CELL_FONT_SIZE = 9;
const CELL_LINE_HEIGHT = 11;
// Mêmes teintes que le SVG (gridImage.ts) et l'écran (index.css), pour une
// apparence cohérente entre les trois : bordure de case (slate-200) et texte
// sombre par défaut (slate-900).
const BORDER_GRAY: [number, number, number] = [226, 232, 240];
const DARK_TEXT: [number, number, number] = [15, 23, 42];
const WHITE: [number, number, number] = [255, 255, 255];

export interface BoardLayout {
  /** Largeur disponible pour le titre (bords de page exclus). */
  contentWidth: number;
  boardX: number;
  boardY: number;
  /** Côté d'une case (le plateau est toujours carré). */
  cellSize: number;
}

/** Calcule la position/taille du plateau carré, centré sous le titre et mis
 * à l'échelle pour occuper tout l'espace disponible sur la page — fonction
 * pure, testable indépendamment de jsPDF. */
export function computeBoardLayout(pageWidth: number, pageHeight: number, gridSize: number): BoardLayout {
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  const contentHeight = pageHeight - PAGE_MARGIN * 2 - TITLE_AREA_HEIGHT;
  const boardSize = Math.min(contentWidth, contentHeight);
  const boardX = (pageWidth - boardSize) / 2;
  const boardY = PAGE_MARGIN + TITLE_AREA_HEIGHT;
  const cellSize = (boardSize - CELL_GAP * (gridSize - 1)) / gridSize;
  return { contentWidth, boardX, boardY, cellSize };
}

export interface CellLayout {
  x: number;
  y: number;
  size: number;
  fillColor: [number, number, number];
  textColor: [number, number, number];
}

/** Calcule la position et les couleurs d'une case, à partir du plateau et de
 * son état (cochée/libre/vide) — fonction pure, testable indépendamment de
 * jsPDF. Même priorité que buildGridSvg (gridImage.ts) : une case cochée
 * prime sur "libre" (une case libre démarre toujours cochée, voir buildCells
 * dans bingo.ts — l'état libre-mais-non-coché ne survient que pour une
 * grille malformée, ex. import externe). */
export function computeCellLayout(
  index: number,
  gridSize: number,
  board: Pick<BoardLayout, "boardX" | "boardY" | "cellSize">,
  cell: Cell,
  accentRgb: [number, number, number],
  freeTintRgb: [number, number, number]
): CellLayout {
  const row = Math.floor(index / gridSize);
  const col = index % gridSize;
  const x = board.boardX + col * (board.cellSize + CELL_GAP);
  const y = board.boardY + row * (board.cellSize + CELL_GAP);

  const [fillColor, textColor]: [[number, number, number], [number, number, number]] = cell.marked
    ? [accentRgb, WHITE]
    : cell.free
      ? [freeTintRgb, accentRgb]
      : [WHITE, DARK_TEXT];

  return { x, y, size: board.cellSize, fillColor, textColor };
}

/** Calcule la position verticale de chaque ligne d'un texte multi-lignes,
 * centré verticalement autour de `cellCenterY` — fonction pure, testable
 * indépendamment de jsPDF. */
export function computeLineYPositions(cellCenterY: number, lineCount: number): number[] {
  const blockHeight = lineCount * CELL_LINE_HEIGHT;
  const firstLineY = cellCenterY - blockHeight / 2 + CELL_LINE_HEIGHT * 0.8;
  return Array.from({ length: lineCount }, (_, i) => firstLineY + i * CELL_LINE_HEIGHT);
}

/** Dessine une grille sur la page jsPDF courante (voir exportGridsAsPdf) :
 * titre centré en haut, puis le plateau. Dessine avec les primitives
 * vectorielles natives de jsPDF (rectangles/texte) plutôt qu'en rasterisant
 * le SVG de buildGridSvg (gridImage.ts) : ce dernier utilise un
 * <foreignObject> pour le texte des cases, mal supporté une fois chargé comme
 * image dans un <canvas> (hors d'un document HTML réel) — redessiner la même
 * mise en page en primitives natives jsPDF garantit un rendu net et fiable à
 * l'impression, seul but de cet export. La géométrie/les couleurs sont
 * calculées par les fonctions pures ci-dessus (computeBoardLayout,
 * computeCellLayout, computeLineYPositions) ; cette fonction ne fait plus que
 * les transmettre à jsPDF, dans le même ordre que buildGridSvg.
 *
 * `doc` est typé sur le module chargé dynamiquement par l'appelant (voir
 * exportGridsAsPdf) plutôt qu'importé statiquement ici : jsPDF (~200 Ko) ne
 * doit entrer dans le bundle que si cet export est effectivement déclenché. */
function drawGridPage(doc: JsPdfDoc, grid: Grid) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const board = computeBoardLayout(pageWidth, pageHeight, grid.size);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...DARK_TEXT);
  doc.text(grid.title, pageWidth / 2, PAGE_MARGIN + 20, { align: "center", maxWidth: board.contentWidth });

  // grid.color peut venir d'une grille importée (backup JSON, lien de
  // partage, synchro distante) sans être passé par le sélecteur de
  // CustomizeModal, qui garantit seul un hex à 6 chiffres — même validation
  // à l'usage que gridImage.ts/GridCard.tsx, voir CLAUDE.md.
  const accent = grid.color && isValidHexColor(grid.color) ? grid.color : DEFAULT_ACCENT;
  const accentRgb = hexToRgb(accent);
  const freeTintRgb = hexToRgb(tintWithWhite(accent, FREE_CELL_TINT_RATIO));

  grid.cells.forEach((cell, i) => {
    const layout = computeCellLayout(i, grid.size, board, cell, accentRgb, freeTintRgb);

    doc.setFillColor(...layout.fillColor);
    doc.setTextColor(...layout.textColor);
    doc.setDrawColor(...BORDER_GRAY);
    doc.roundedRect(layout.x, layout.y, layout.size, layout.size, CELL_CORNER_RADIUS, CELL_CORNER_RADIUS, "FD");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(CELL_FONT_SIZE);
    const maxTextWidth = layout.size - CELL_TEXT_PADDING * 2;
    const lines = doc.splitTextToSize(cell.label, maxTextWidth) as string[];
    const lineYs = computeLineYPositions(layout.y + layout.size / 2, lines.length);
    lines.forEach((line, li) => {
      doc.text(line, layout.x + layout.size / 2, lineYs[li], { align: "center", maxWidth: maxTextWidth });
    });
  });
}

/** Exporte une ou plusieurs grilles en PDF, une par page (format A4) — pour
 * imprimer un lot de cartes physiques distinctes lors d'une soirée à
 * plusieurs joueurs (voir generateCardVariants dans bingo.ts pour les
 * générer). `filename` sans l'extension ".pdf", ajoutée automatiquement si
 * absente. */
export async function exportGridsAsPdf(grids: Grid[], filename: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  grids.forEach((grid, index) => {
    if (index > 0) doc.addPage();
    drawGridPage(doc, grid);
  });

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
