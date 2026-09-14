import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Grid } from "./bingo";
import { computeBoardLayout, computeCellLayout, computeLineYPositions, exportGridsAsPdf } from "./pdfExport";

describe("computeBoardLayout", () => {
  it("centers a square board sized to fit the narrower dimension (width-constrained, A4 portrait)", () => {
    // A4 portrait 595.28×841.89pt : la largeur disponible (515.28, marges de
    // 40pt) est plus étroite que la hauteur disponible sous le titre
    // (711.89, 50pt de bandeau), donc le plateau est limité par la largeur.
    const layout = computeBoardLayout(595.28, 841.89, 3);
    expect(layout.contentWidth).toBeCloseTo(515.28, 6);
    expect(layout.boardX).toBeCloseTo(40, 6); // centré : (595.28-515.28)/2
    expect(layout.boardY).toBeCloseTo(90, 6); // marge(40) + bandeau titre(50)
    expect(layout.cellSize).toBeCloseTo((515.28 - 6 * 2) / 3, 6);
  });

  it("centers a square board sized to fit the narrower dimension (height-constrained, wide page)", () => {
    // Page large et basse : la hauteur disponible sous le titre devient la
    // contrainte plutôt que la largeur.
    const layout = computeBoardLayout(1000, 300, 3);
    const contentHeight = 300 - 40 * 2 - 50; // 170
    expect(layout.contentWidth).toBeCloseTo(920, 6);
    expect(layout.cellSize).toBeCloseTo((contentHeight - 6 * 2) / 3, 6);
    expect(layout.boardX).toBeCloseTo((1000 - contentHeight) / 2, 6);
  });

  it("shrinks each cell as the grid size grows, on the same board", () => {
    const layout3 = computeBoardLayout(595.28, 841.89, 3);
    const layout5 = computeBoardLayout(595.28, 841.89, 5);
    expect(layout5.cellSize).toBeLessThan(layout3.cellSize);
  });
});

describe("computeCellLayout", () => {
  const board = { boardX: 10, boardY: 20, cellSize: 50 };
  const accent: [number, number, number] = [0x11, 0x22, 0x33];
  const freeTint: [number, number, number] = [0xd0, 0xd5, 0xda];

  it("positions the origin cell (row 0, col 0) at the board's corner", () => {
    const layout = computeCellLayout(0, 3, board, { label: "A", free: false, marked: false }, accent, freeTint);
    expect(layout.x).toBe(10);
    expect(layout.y).toBe(20);
    expect(layout.size).toBe(50);
  });

  it("offsets an interior cell (row 1, col 1) by cell size plus gap on both axes", () => {
    const layout = computeCellLayout(4, 3, board, { label: "E", free: false, marked: false }, accent, freeTint);
    expect(layout.x).toBe(66); // 10 + 1*(50+6)
    expect(layout.y).toBe(76); // 20 + 1*(50+6)
  });

  it("positions the last cell (row 2, col 2) at its far corner", () => {
    const layout = computeCellLayout(8, 3, board, { label: "I", free: false, marked: false }, accent, freeTint);
    expect(layout.x).toBe(122); // 10 + 2*(50+6)
    expect(layout.y).toBe(132); // 20 + 2*(50+6)
  });

  it("fills a marked cell with the accent color and white text", () => {
    const layout = computeCellLayout(0, 3, board, { label: "A", free: false, marked: true }, accent, freeTint);
    expect(layout.fillColor).toEqual(accent);
    expect(layout.textColor).toEqual([255, 255, 255]);
  });

  it("fills an unmarked, non-free cell with white and dark text", () => {
    const layout = computeCellLayout(0, 3, board, { label: "A", free: false, marked: false }, accent, freeTint);
    expect(layout.fillColor).toEqual([255, 255, 255]);
    expect(layout.textColor).toEqual([15, 23, 42]);
  });

  it("fills an unmarked free cell with the tint and accent-colored text (a state gameplay never actually produces — a free cell always starts marked, see buildCells in bingo.ts — but must still render correctly for a malformed/imported grid)", () => {
    const layout = computeCellLayout(0, 3, board, { label: "GRATUIT", free: true, marked: false }, accent, freeTint);
    expect(layout.fillColor).toEqual(freeTint);
    expect(layout.textColor).toEqual(accent);
  });

  it("gives priority to `marked` over `free`, like buildGridSvg (a free cell always starts marked)", () => {
    const layout = computeCellLayout(0, 3, board, { label: "GRATUIT", free: true, marked: true }, accent, freeTint);
    expect(layout.fillColor).toEqual(accent);
    expect(layout.textColor).toEqual([255, 255, 255]);
  });
});

describe("computeLineYPositions", () => {
  it("centers a single line vertically around the cell center", () => {
    expect(computeLineYPositions(100, 1)).toEqual([103.3]);
  });

  it("centers a two-line block, spacing lines by the line height", () => {
    expect(computeLineYPositions(100, 2)).toEqual([97.8, 108.8]);
  });

  it("returns an empty array for zero lines", () => {
    expect(computeLineYPositions(100, 0)).toEqual([]);
  });
});

// Déclarés via vi.hoisted (exécuté avant vi.mock, lui-même hissé au-dessus
// des imports) : le factory de vi.mock doit pouvoir les référencer.
const mocks = vi.hoisted(() => ({
  jsPDFCtor: vi.fn(),
  addPage: vi.fn(),
  setFont: vi.fn(),
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  setFillColor: vi.fn(),
  setDrawColor: vi.fn(),
  roundedRect: vi.fn(),
  text: vi.fn(),
  splitTextToSize: vi.fn((s: string) => [s]),
  save: vi.fn(),
}));

// Simule uniquement la surface d'API utilisée par pdfExport.ts : suffisant
// pour vérifier l'orchestration (pages créées, nom de fichier, transmission
// correcte des valeurs calculées par les fonctions pures ci-dessus à jsPDF)
// sans dépendre du rendu réel de jsPDF ni de son poids dans les tests. La
// géométrie/les couleurs elles-mêmes sont déjà exhaustivement vérifiées par
// les tests de computeBoardLayout/computeCellLayout/computeLineYPositions
// ci-dessus, réutilisés ici comme référence plutôt que recalculés à la main.
vi.mock("jspdf", () => ({
  jsPDF: class {
    internal = { pageSize: { getWidth: () => 595.28, getHeight: () => 841.89 } };
    constructor(...args: unknown[]) {
      mocks.jsPDFCtor(...args);
    }
    addPage = mocks.addPage;
    setFont = mocks.setFont;
    setFontSize = mocks.setFontSize;
    setTextColor = mocks.setTextColor;
    setFillColor = mocks.setFillColor;
    setDrawColor = mocks.setDrawColor;
    roundedRect = mocks.roundedRect;
    text = mocks.text;
    splitTextToSize = mocks.splitTextToSize;
    save = mocks.save;
  },
}));

function makeGrid(overrides: Partial<Grid> = {}): Grid {
  return {
    id: "g1",
    title: "Ma grille",
    size: 3,
    freeCenter: false,
    items: ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
    cells: [
      { label: "A", free: false, marked: true },
      { label: "B", free: false, marked: false },
      { label: "C", free: false, marked: false },
      { label: "D", free: false, marked: false },
      { label: "E", free: false, marked: false },
      { label: "F", free: false, marked: false },
      { label: "G", free: false, marked: false },
      { label: "H", free: false, marked: false },
      { label: "I", free: false, marked: false },
    ],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.splitTextToSize.mockImplementation((s: string) => [s]);
});

describe("exportGridsAsPdf", () => {
  it("crée un document A4 portrait en points", async () => {
    await exportGridsAsPdf([makeGrid()], "cartes");
    expect(mocks.jsPDFCtor).toHaveBeenCalledWith({ orientation: "portrait", unit: "pt", format: "a4" });
  });

  it("n'ajoute pas de page supplémentaire pour une seule grille", async () => {
    await exportGridsAsPdf([makeGrid()], "cartes");
    expect(mocks.addPage).not.toHaveBeenCalled();
  });

  it("ajoute une page par grille supplémentaire", async () => {
    await exportGridsAsPdf([makeGrid({ id: "g1" }), makeGrid({ id: "g2" }), makeGrid({ id: "g3" })], "cartes");
    expect(mocks.addPage).toHaveBeenCalledTimes(2);
  });

  it("ajoute l'extension .pdf si absente", async () => {
    await exportGridsAsPdf([makeGrid()], "cartes");
    expect(mocks.save).toHaveBeenCalledWith("cartes.pdf");
  });

  it("ne double pas l'extension .pdf si déjà présente", async () => {
    await exportGridsAsPdf([makeGrid()], "cartes.pdf");
    expect(mocks.save).toHaveBeenCalledWith("cartes.pdf");
  });

  it("dessine le titre de la grille, centré en haut de page, en gras taille 18", async () => {
    await exportGridsAsPdf([makeGrid({ title: "Soirée jeux" })], "cartes");
    const board = computeBoardLayout(595.28, 841.89, 3);
    expect(mocks.setFont).toHaveBeenCalledWith("helvetica", "bold");
    expect(mocks.setFontSize).toHaveBeenCalledWith(18);
    expect(mocks.text).toHaveBeenCalledWith(
      "Soirée jeux",
      595.28 / 2,
      60, // marge de page (40) + décalage titre (20), voir pdfExport.ts
      { align: "center", maxWidth: board.contentWidth }
    );
  });

  it("transmet à jsPDF la position/couleur calculée par computeCellLayout pour chaque case", async () => {
    await exportGridsAsPdf([makeGrid()], "cartes");
    const board = computeBoardLayout(595.28, 841.89, 3);
    const accent: [number, number, number] = [0x25, 0x63, 0xeb]; // #2563eb, accent par défaut
    const freeTint: [number, number, number] = [0xd8, 0xe3, 0xfb]; // 18% de l'accent sur blanc

    // Case 0 : cochée (voir makeGrid) -> accent plein, texte blanc.
    const expected0 = computeCellLayout(0, 3, board, { label: "A", free: false, marked: true }, accent, freeTint);
    expect(mocks.roundedRect).toHaveBeenNthCalledWith(1, expected0.x, expected0.y, expected0.size, expected0.size, 6, 6, "FD");
    expect(mocks.setFillColor).toHaveBeenNthCalledWith(1, ...expected0.fillColor);
    expect(mocks.setTextColor).toHaveBeenNthCalledWith(2, ...expected0.textColor); // 1er appel : titre

    // Case 4 (intérieure) : non cochée -> blanc, texte sombre.
    const expected4 = computeCellLayout(4, 3, board, { label: "E", free: false, marked: false }, accent, freeTint);
    expect(mocks.roundedRect).toHaveBeenNthCalledWith(5, expected4.x, expected4.y, expected4.size, expected4.size, 6, 6, "FD");
  });

  it("applique la couleur personnalisée de la grille plutôt que l'accent par défaut", async () => {
    await exportGridsAsPdf([makeGrid({ color: "#112233" })], "cartes");
    expect(mocks.setFillColor).toHaveBeenCalledWith(0x11, 0x22, 0x33);
  });

  it("retombe sur la couleur par défaut si `color` est absente ou invalide (grille importée non fiable)", async () => {
    await exportGridsAsPdf([makeGrid({ color: "not-a-color" })], "cartes");
    expect(mocks.setFillColor).toHaveBeenCalledWith(0x25, 0x63, 0xeb);
  });

  it("dessine chaque case avec des coins arrondis, remplie et bordée", async () => {
    await exportGridsAsPdf([makeGrid()], "cartes");
    expect(mocks.roundedRect).toHaveBeenCalledTimes(9);
    for (const call of mocks.roundedRect.mock.calls) {
      expect(call[4]).toBe(6); // rx
      expect(call[5]).toBe(6); // ry
      expect(call[6]).toBe("FD"); // rempli + bordé
    }
  });

  it("bordure toujours gris ardoise, quelle que soit la case", async () => {
    await exportGridsAsPdf([makeGrid()], "cartes");
    expect(mocks.setDrawColor).toHaveBeenCalledTimes(9);
    for (const call of mocks.setDrawColor.mock.calls) {
      expect(call).toEqual([226, 232, 240]);
    }
  });

  it("règle la police des cases en normal, taille 9, après celle du titre", async () => {
    await exportGridsAsPdf([makeGrid()], "cartes");
    expect(mocks.setFont).toHaveBeenNthCalledWith(1, "helvetica", "bold");
    expect(mocks.setFont).toHaveBeenNthCalledWith(2, "helvetica", "normal");
    expect(mocks.setFontSize).toHaveBeenNthCalledWith(2, 9);
  });

  it("découpe le texte d'une case à la largeur utile (taille de case moins le remplissage)", async () => {
    await exportGridsAsPdf([makeGrid()], "cartes");
    const board = computeBoardLayout(595.28, 841.89, 3);
    expect(mocks.splitTextToSize).toHaveBeenCalledWith("A", board.cellSize - 10 * 2);
  });

  it("répartit le texte d'une case sur plusieurs lignes, aux positions verticales attendues", async () => {
    mocks.splitTextToSize.mockReturnValue(["Ligne 1", "Ligne 2"]);
    await exportGridsAsPdf([makeGrid()], "cartes");
    const board = computeBoardLayout(595.28, 841.89, 3);
    const cell0 = computeCellLayout(0, 3, board, { label: "A", free: false, marked: true }, [0x25, 0x63, 0xeb], [0xd8, 0xe3, 0xfb]);
    const [y1, y2] = computeLineYPositions(cell0.y + cell0.size / 2, 2);
    const textX = cell0.x + cell0.size / 2;
    expect(mocks.text).toHaveBeenCalledWith("Ligne 1", textX, y1, { align: "center", maxWidth: cell0.size - 20 });
    expect(mocks.text).toHaveBeenCalledWith("Ligne 2", textX, y2, { align: "center", maxWidth: cell0.size - 20 });
  });
});
