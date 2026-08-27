import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCells, type Grid } from "./bingo";
import { buildGridSvg, downloadGridSvg } from "./gridImage";

const CELL_SIZE = 120;
const GAP = 8;
const PADDING = 24;
const TITLE_HEIGHT = 60;

function makeGrid(overrides: Partial<Grid> = {}): Grid {
  const size = overrides.size ?? 3;
  const freeCenter = overrides.freeCenter ?? false;
  const items = overrides.items ?? ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  return {
    id: "fixed-id",
    title: "Grille test",
    size,
    freeCenter,
    items,
    cells: buildCells(items, size, freeCenter),
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

/** Dimensions attendues (mêmes formules que gridImage.ts) pour une grille de
 * taille `n`, à recalculer indépendamment dans les tests plutôt que
 * d'importer les constantes internes du module testé. */
function expectedCanvas(n: number) {
  const boardSize = n * CELL_SIZE + (n - 1) * GAP;
  const width = boardSize + PADDING * 2;
  const height = boardSize + PADDING * 2 + TITLE_HEIGHT;
  return { width, height };
}

/** Position/dimensions attendues du carré et du texte d'une case donnée. */
function expectedCell(n: number, index: number) {
  const row = Math.floor(index / n);
  const col = index % n;
  const x = PADDING + col * (CELL_SIZE + GAP);
  const y = PADDING + TITLE_HEIGHT + row * (CELL_SIZE + GAP);
  return {
    rect: { x, y, width: CELL_SIZE, height: CELL_SIZE },
    foreignObject: { x: x + 6, y: y + 6, width: CELL_SIZE - 12, height: CELL_SIZE - 12 },
  };
}

function svgRoot(svg: string) {
  const m = svg.match(
    /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="([\d.-]+)" height="([\d.-]+)" viewBox="0 0 ([\d.-]+) ([\d.-]+)">/
  )!;
  return { width: Number(m[1]), height: Number(m[2]), vbWidth: Number(m[3]), vbHeight: Number(m[4]) };
}

function titleText(svg: string) {
  const m = svg.match(/<text x="([\d.-]+)" y="([\d.-]+)"/)!;
  return { x: Number(m[1]), y: Number(m[2]) };
}

/** Les carrés de case (avec `rx="14"`) — distincts du rectangle de fond, qui
 * n'a ni x/y ni rx. */
function cellRects(svg: string) {
  return [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)" rx="14" fill="([^"]*)"/g)].map(
    (m) => ({ x: Number(m[1]), y: Number(m[2]), width: Number(m[3]), height: Number(m[4]), fill: m[5] })
  );
}

function cellForeignObjects(svg: string) {
  return [...svg.matchAll(/<foreignObject x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/g)].map(
    (m) => ({ x: Number(m[1]), y: Number(m[2]), width: Number(m[3]), height: Number(m[4]) })
  );
}

function cellTextColors(svg: string) {
  return [...svg.matchAll(/color:(#[0-9a-f]{6});overflow/g)].map((m) => m[1]);
}

describe("buildGridSvg", () => {
  it("sizes the canvas exactly from the grid size (3×3)", () => {
    const svg = buildGridSvg(makeGrid({ size: 3 }));
    const root = svgRoot(svg);
    const expected = expectedCanvas(3);
    expect(root).toEqual({ ...expected, vbWidth: expected.width, vbHeight: expected.height });
  });

  it("sizes the canvas exactly from the grid size (5×5)", () => {
    const svg = buildGridSvg(
      makeGrid({ size: 5, items: Array.from({ length: 25 }, (_, i) => `item-${i}`) })
    );
    const root = svgRoot(svg);
    const expected = expectedCanvas(5);
    expect(root).toEqual({ ...expected, vbWidth: expected.width, vbHeight: expected.height });
  });

  it("centers the title horizontally and places it in the top padding band", () => {
    const svg = buildGridSvg(makeGrid({ size: 3 }));
    expect(titleText(svg)).toEqual({ x: expectedCanvas(3).width / 2, y: PADDING + 30 });
  });

  it("includes the grid title as text", () => {
    const svg = buildGridSvg(makeGrid({ title: "Bingo réunion" }));
    expect(svg).toContain(">Bingo réunion<");
  });

  it("escapes XML-sensitive characters in the title", () => {
    const svg = buildGridSvg(makeGrid({ title: `A & B <C> "D"` }));
    expect(svg).toContain("A &amp; B &lt;C&gt; &quot;D&quot;");
    expect(svg).not.toContain("<C>");
  });

  it("escapes XML-sensitive characters in a cell label", () => {
    const items = ["A & B", "C", "D", "E", "F", "G", "H", "I", "J"];
    const svg = buildGridSvg(makeGrid({ items }));
    expect(svg).toContain("A &amp; B");
  });

  it("renders exactly size*size cell rects, positioned exactly for the first cell (row 0, col 0)", () => {
    const svg = buildGridSvg(makeGrid({ size: 3 }));
    const rects = cellRects(svg);
    expect(rects).toHaveLength(9);
    expect(rects[0]).toMatchObject(expectedCell(3, 0).rect);
  });

  it("positions an interior cell (row 1, col 1) exactly, distinguishing row/col from the origin cell", () => {
    const svg = buildGridSvg(makeGrid({ size: 3 }));
    const rects = cellRects(svg);
    expect(rects[4]).toMatchObject(expectedCell(3, 4).rect);
  });

  it("positions the last cell (row 2, col 2) of a 3×3 grid exactly", () => {
    const svg = buildGridSvg(makeGrid({ size: 3 }));
    const rects = cellRects(svg);
    expect(rects[8]).toMatchObject(expectedCell(3, 8).rect);
  });

  it("offsets each cell's foreignObject by exactly 6px on every side", () => {
    const svg = buildGridSvg(makeGrid({ size: 3 }));
    const fos = cellForeignObjects(svg);
    expect(fos[0]).toEqual(expectedCell(3, 0).foreignObject);
    expect(fos[4]).toEqual(expectedCell(3, 4).foreignObject);
  });

  it("joins cells directly with no separator between them", () => {
    const svg = buildGridSvg(makeGrid({ size: 3 }));
    // Chaque case se termine par `</foreignObject>` et la suivante commence
    // par `<rect` : un séparateur non vide casserait cette jonction directe.
    expect(svg.match(/<\/foreignObject><rect/g)).toHaveLength(8); // 9 cases, 8 jonctions
  });

  it("fills a marked cell with the grid's custom color", () => {
    const cells = buildCells(["A", "B", "C", "D", "E", "F", "G", "H", "I"], 3, false).map((c, i) => ({
      ...c,
      marked: i === 0,
    }));
    const svg = buildGridSvg(makeGrid({ cells, color: "#db2777" }));
    expect(cellRects(svg)[0].fill).toBe("#db2777");
  });

  it("falls back to the default accent color for a marked cell when no custom color is set", () => {
    const cells = buildCells(["A", "B", "C", "D", "E", "F", "G", "H", "I"], 3, false).map((c, i) => ({
      ...c,
      marked: i === 0,
    }));
    const svg = buildGridSvg(makeGrid({ cells, color: undefined }));
    expect(cellRects(svg)[0].fill).toBe("#2563eb");
  });

  it("gives an unmarked, non-free cell a white fill and dark text", () => {
    const cells = buildCells(["A", "B", "C", "D", "E", "F", "G", "H", "I"], 3, false);
    const svg = buildGridSvg(makeGrid({ cells }));
    expect(cellRects(svg)[0].fill).toBe("#ffffff");
    expect(cellTextColors(svg)[0]).toBe("#0f172a");
  });

  it("gives an unmarked free cell a tint of the default accent (a state gameplay never actually produces, but the function must still render it correctly)", () => {
    const cells = buildCells(["A", "B", "C", "D", "E", "F", "G", "H"], 3, true).map((c) =>
      c.free ? { ...c, marked: false } : c
    );
    const svg = buildGridSvg(makeGrid({ cells, freeCenter: true, color: undefined }));
    const freeIndex = cells.findIndex((c) => c.free);
    // Calculée indépendamment de tintWithWhite : 18% de #2563eb sur fond blanc.
    expect(cellRects(svg)[freeIndex].fill).toBe("#d8e3fb");
    expect(cellTextColors(svg)[freeIndex]).toBe("#2563eb");
  });

  it("tints an unmarked free cell from the grid's own custom color, not a fixed color", () => {
    const cells = buildCells(["A", "B", "C", "D", "E", "F", "G", "H"], 3, true).map((c) =>
      c.free ? { ...c, marked: false } : c
    );
    const svg = buildGridSvg(makeGrid({ cells, freeCenter: true, color: "#db2777" }));
    const freeIndex = cells.findIndex((c) => c.free);
    // Calculée indépendamment de tintWithWhite : 18% de #db2777 sur fond blanc.
    expect(cellRects(svg)[freeIndex].fill).toBe("#f9d8e7");
    expect(cellTextColors(svg)[freeIndex]).toBe("#db2777");
  });

  it("gives a marked cell white text regardless of whether it's free", () => {
    const cells = buildCells(["A", "B", "C", "D", "E", "F", "G", "H"], 3, true); // free cell starts marked
    const svg = buildGridSvg(makeGrid({ cells, freeCenter: true }));
    const freeIndex = cells.findIndex((c) => c.free);
    expect(cellTextColors(svg)[freeIndex]).toBe("#ffffff");
  });
});

describe("downloadGridSvg", () => {
  let createElementSpy: ReturnType<typeof vi.spyOn>;
  let clickSpy: ReturnType<typeof vi.fn<() => void>>;
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let lastAnchor: HTMLAnchorElement | null;

  beforeEach(() => {
    clickSpy = vi.fn();
    lastAnchor = null;
    const originalCreateElement = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") {
        const anchor = el as HTMLAnchorElement;
        anchor.click = clickSpy;
        lastAnchor = anchor;
      }
      return el;
    });
    createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    createElementSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it("downloads a blob containing the SVG markup", async () => {
    const grid = makeGrid({ title: "Ma grille" });
    downloadGridSvg(grid);

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("image/svg+xml");
    const text = await blob.text();
    expect(text).toBe(buildGridSvg(grid));
  });

  it("names the file after a slugified title", () => {
    downloadGridSvg(makeGrid({ title: "Bingo Réunion d'Équipe !" }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(lastAnchor?.download).toBe("Bingo-R-union-d-quipe-.svg");
  });

  it("collapses a run of non-filename-safe characters to a single dash", () => {
    downloadGridSvg(makeGrid({ title: "🎉🎉🎉" }));
    expect(lastAnchor?.download).toBe("-.svg");
  });

  it('falls back to "grille" for an empty title', () => {
    downloadGridSvg(makeGrid({ title: "" }));
    expect(lastAnchor?.download).toBe("grille.svg");
  });
});
