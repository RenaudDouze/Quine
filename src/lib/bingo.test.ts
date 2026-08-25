import { describe, expect, it, vi } from "vitest";
import {
  buildCells,
  checkWin,
  matchesSearch,
  neededCount,
  shuffle,
  sortByPinned,
  WIN_RULES,
  type Cell,
  type Grid,
} from "./bingo";

function makeGrid(overrides: Partial<Grid> = {}): Grid {
  return {
    id: overrides.id ?? "g1",
    title: overrides.title ?? "Grille",
    size: 3,
    freeCenter: false,
    items: [],
    cells: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("neededCount", () => {
  it("returns size*size for an even grid regardless of freeCenter", () => {
    expect(neededCount(4, false)).toBe(16);
    expect(neededCount(4, true)).toBe(16);
  });

  it("returns size*size for an odd grid without free center", () => {
    expect(neededCount(5, false)).toBe(25);
  });

  it("returns size*size - 1 for an odd grid with free center", () => {
    expect(neededCount(3, true)).toBe(8);
    expect(neededCount(5, true)).toBe(24);
  });
});

describe("shuffle", () => {
  it("preserves all elements", () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(result).toHaveLength(input.length);
    expect(result.slice().sort()).toEqual(input.slice().sort());
  });

  it("does not mutate the input array", () => {
    // Mock a non-identity permutation so an accidental in-place shuffle is
    // reliably detected instead of only failing when the random draw
    // happens to reproduce the original order.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const input = ["A", "B", "C", "D"];
      const copy = input.slice();
      shuffle(input);
      expect(input).toEqual(copy);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("performs an exact Fisher-Yates pass for a given random sequence", () => {
    // With Math.random pinned to 0.5, the swap index at each step depends on
    // both the multiplication and the +1 offset — this pins down the exact
    // resulting order and catches arithmetic/loop regressions in the algorithm.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      expect(shuffle(["A", "B", "C", "D"])).toEqual(["A", "D", "B", "C"]);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("buildCells", () => {
  it("builds size*size cells with every requested label present", () => {
    const items = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
    const cells = buildCells(items, 3, false);
    expect(cells).toHaveLength(9);
    expect(cells.map((c) => c.label).sort()).toEqual(items.slice().sort());
    expect(cells.every((c) => !c.free && !c.marked)).toBe(true);
  });

  it("places a marked free cell at the exact center for odd sizes when requested", () => {
    const items = Array.from({ length: 24 }, (_, i) => `item-${i}`);
    const cells = buildCells(items, 5, true);
    expect(cells).toHaveLength(25);
    const centerIndex = 12;
    expect(cells[centerIndex].free).toBe(true);
    expect(cells[centerIndex].marked).toBe(true);
    expect(cells[centerIndex].label).toBe("GRATUIT");
    expect(cells.filter((c) => c.free)).toHaveLength(1);
  });

  it("ignores freeCenter for even sizes", () => {
    const items = Array.from({ length: 16 }, (_, i) => `item-${i}`);
    const cells = buildCells(items, 4, true);
    expect(cells.every((c) => !c.free)).toBe(true);
    expect(cells).toHaveLength(16);
  });

  it("makes a 1x1 grid a single free cell when freeCenter is requested", () => {
    const cells = buildCells([], 1, true);
    expect(cells).toEqual([{ label: "GRATUIT", free: true, marked: true }]);
  });

  it("only uses as many items as needed, ignoring extras", () => {
    const items = Array.from({ length: 20 }, (_, i) => `item-${i}`);
    const cells = buildCells(items, 3, false);
    expect(cells).toHaveLength(9);
    const labels = new Set(cells.map((c) => c.label));
    expect(labels.size).toBe(9);
  });
});

function makeCells(size: number, markedIndexes: number[]): Cell[] {
  const marked = new Set(markedIndexes);
  return Array.from({ length: size * size }, (_, i) => ({
    label: `c${i}`,
    free: false,
    marked: marked.has(i),
  }));
}

describe("checkWin", () => {
  it("detects no win on an empty grid", () => {
    const cells = makeCells(3, []);
    const { hasWin, winSet } = checkWin(cells, 3);
    expect(hasWin).toBe(false);
    expect(winSet.size).toBe(0);
  });

  it("detects a full row win", () => {
    const cells = makeCells(3, [3, 4, 5]);
    const { hasWin, winSet } = checkWin(cells, 3);
    expect(hasWin).toBe(true);
    expect([...winSet].sort()).toEqual([3, 4, 5]);
  });

  it("detects a full column win", () => {
    const cells = makeCells(3, [1, 4, 7]);
    const { hasWin, winSet } = checkWin(cells, 3);
    expect(hasWin).toBe(true);
    expect([...winSet].sort((a, b) => a - b)).toEqual([1, 4, 7]);
  });

  it("detects the main diagonal", () => {
    const cells = makeCells(3, [0, 4, 8]);
    const { hasWin, winSet } = checkWin(cells, 3);
    expect(hasWin).toBe(true);
    expect([...winSet].sort((a, b) => a - b)).toEqual([0, 4, 8]);
  });

  it("detects the anti-diagonal", () => {
    const cells = makeCells(3, [2, 4, 6]);
    const { hasWin, winSet } = checkWin(cells, 3);
    expect(hasWin).toBe(true);
    expect([...winSet].sort((a, b) => a - b)).toEqual([2, 4, 6]);
  });

  it("does not report a win for a partially marked line", () => {
    const cells = makeCells(3, [3, 4]);
    const { hasWin } = checkWin(cells, 3);
    expect(hasWin).toBe(false);
  });

  it("accumulates every winning line in winSet when multiple lines are complete", () => {
    // Row 0 (0,1,2) and column 0 (0,3,6) are both complete.
    const cells = makeCells(3, [0, 1, 2, 3, 6]);
    const { hasWin, winSet } = checkWin(cells, 3);
    expect(hasWin).toBe(true);
    expect([...winSet].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 6]);
  });

  it('defaults to the "line" rule when none is given', () => {
    const cells = makeCells(3, [0, 1, 2]);
    expect(checkWin(cells, 3).hasWin).toBe(true);
  });

  it('applies the "line" rule explicitly the same way as the default', () => {
    const cells = makeCells(3, [0, 1, 2]);
    expect(checkWin(cells, 3, "line").hasWin).toBe(true);
  });

  describe('rule "blackout" (carton plein)', () => {
    it("does not win with a complete line but an otherwise empty grid", () => {
      const cells = makeCells(3, [0, 1, 2]);
      expect(checkWin(cells, 3, "blackout").hasWin).toBe(false);
    });

    it("does not win with all but one cell marked", () => {
      const cells = makeCells(3, [0, 1, 2, 3, 4, 5, 6, 7]);
      expect(checkWin(cells, 3, "blackout").hasWin).toBe(false);
    });

    it("wins once every cell is marked, with winSet covering the whole grid", () => {
      const cells = makeCells(3, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
      const { hasWin, winSet } = checkWin(cells, 3, "blackout");
      expect(hasWin).toBe(true);
      expect([...winSet].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    });
  });

  describe('rule "corners" (quatre coins)', () => {
    it("does not win with only three of the four corners marked", () => {
      // Corners of a 3x3 grid: 0, 2, 6, 8.
      const cells = makeCells(3, [0, 2, 6]);
      expect(checkWin(cells, 3, "corners").hasWin).toBe(false);
    });

    it("does not win from a fully marked line that isn't the corners", () => {
      const cells = makeCells(3, [0, 1, 2]);
      expect(checkWin(cells, 3, "corners").hasWin).toBe(false);
    });

    it("wins once all four corners are marked, with winSet covering exactly the corners", () => {
      const cells = makeCells(3, [0, 2, 6, 8]);
      const { hasWin, winSet } = checkWin(cells, 3, "corners");
      expect(hasWin).toBe(true);
      expect([...winSet].sort((a, b) => a - b)).toEqual([0, 2, 6, 8]);
    });

    it("computes the correct corner indexes for a different grid size", () => {
      // Corners of a 5x5 grid: 0, 4, 20, 24.
      const cells = makeCells(5, [0, 4, 20, 24]);
      const { hasWin, winSet } = checkWin(cells, 5, "corners");
      expect(hasWin).toBe(true);
      expect([...winSet].sort((a, b) => a - b)).toEqual([0, 4, 20, 24]);
    });
  });
});

describe("matchesSearch", () => {
  it("matches any grid when the query is empty", () => {
    expect(matchesSearch(makeGrid({ title: "Bingo réunion" }), "")).toBe(true);
  });

  it("matches any grid when the query is only whitespace", () => {
    expect(matchesSearch(makeGrid({ title: "Bingo réunion" }), "   ")).toBe(true);
  });

  it("matches a title containing the query, case-insensitively", () => {
    expect(matchesSearch(makeGrid({ title: "Bingo Réunion" }), "réunion")).toBe(true);
    expect(matchesSearch(makeGrid({ title: "Bingo Réunion" }), "RÉUNION")).toBe(true);
  });

  it("does not match a title that lacks the query", () => {
    expect(matchesSearch(makeGrid({ title: "Bingo réunion" }), "vacances")).toBe(false);
  });

  it("trims surrounding whitespace from the query before matching", () => {
    expect(matchesSearch(makeGrid({ title: "Bingo réunion" }), "  réunion  ")).toBe(true);
  });
});

describe("sortByPinned", () => {
  it("moves pinned grids to the front", () => {
    const a = makeGrid({ id: "a", pinned: false });
    const b = makeGrid({ id: "b", pinned: true });
    const c = makeGrid({ id: "c", pinned: false });
    expect(sortByPinned([a, b, c]).map((g) => g.id)).toEqual(["b", "a", "c"]);
  });

  it("keeps the relative order within pinned and within unpinned grids (stable sort)", () => {
    const a = makeGrid({ id: "a", pinned: true });
    const b = makeGrid({ id: "b", pinned: false });
    const c = makeGrid({ id: "c", pinned: true });
    const d = makeGrid({ id: "d", pinned: false });
    expect(sortByPinned([a, b, c, d]).map((g) => g.id)).toEqual(["a", "c", "b", "d"]);
  });

  it("does not mutate the input array", () => {
    const a = makeGrid({ id: "a", pinned: false });
    const b = makeGrid({ id: "b", pinned: true });
    const input = [a, b];
    sortByPinned(input);
    expect(input).toEqual([a, b]);
  });

  it("returns an empty array unchanged", () => {
    expect(sortByPinned([])).toEqual([]);
  });
});

describe("WIN_RULES", () => {
  it("contient exactement les trois conditions de victoire attendues", () => {
    // Valeurs littérales (pas de comparaison avec WIN_RULES lui-même) pour
    // détecter un identifiant ou un libellé altéré par erreur.
    expect(WIN_RULES).toEqual([
      { id: "line", label: "ligne, colonne ou diagonale" },
      { id: "blackout", label: "carton plein" },
      { id: "corners", label: "quatre coins" },
    ]);
  });
});
