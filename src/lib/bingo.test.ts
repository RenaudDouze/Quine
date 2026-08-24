import { describe, expect, it, vi } from "vitest";
import { buildCells, checkWin, neededCount, shuffle, type Cell } from "./bingo";

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
});
