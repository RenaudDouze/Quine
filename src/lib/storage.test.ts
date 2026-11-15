import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Grid } from "./bingo";
import { loadGrids, saveGrids, uid } from "./storage";

beforeEach(() => {
  localStorage.clear();
});

describe("loadGrids / saveGrids", () => {
  it("returns an empty array when nothing is stored", () => {
    expect(loadGrids()).toEqual([]);
  });

  it("round-trips grids through localStorage", () => {
    const grid: Grid = {
      id: "1",
      title: "Test",
      size: 3,
      freeCenter: false,
      items: ["A"],
      cells: [],
      createdAt: 0,
      updatedAt: 0,
    };
    saveGrids([grid]);
    expect(loadGrids()).toEqual([grid]);
  });

  it("returns an empty array when the stored value is not valid JSON", () => {
    localStorage.setItem("bingo.grids.v1", "{not json");
    expect(loadGrids()).toEqual([]);
  });
});

describe("uid", () => {
  it("generates distinct ids", () => {
    const ids = new Set(Array.from({ length: 20 }, () => uid()));
    expect(ids.size).toBe(20);
  });

describe("storage — détails", () => {
  it("écrit sous la clé bingo.grids.v1", () => {
    saveGrids([]);
    expect(localStorage.getItem("bingo.grids.v1")).toBe("[]");
  });

  it("uid : horodatage en base 36 suivi de 6 caractères aléatoires", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0.123456789012345);
    expect(uid()).toBe((1_700_000_000_000).toString(36) + (0.123456789012345).toString(36).slice(2, 8));
    vi.restoreAllMocks();
  });
});
});
