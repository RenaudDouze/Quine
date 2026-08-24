import { beforeEach, describe, expect, it } from "vitest";
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
});
