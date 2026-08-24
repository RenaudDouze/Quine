import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCells, type Grid } from "../lib/bingo";
import { loadGrids, saveGrids } from "../lib/storage";
import PlayView from "./PlayView";

function seedGrid(overrides: Partial<Grid> = {}): Grid {
  const size = overrides.size ?? 3;
  const freeCenter = overrides.freeCenter ?? false;
  const items = overrides.items ?? ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const grid: Grid = {
    id: overrides.id ?? "g1",
    title: overrides.title ?? "Ma grille",
    size,
    freeCenter,
    items,
    cells: overrides.cells ?? buildCells(items, size, freeCenter),
    createdAt: 1,
    updatedAt: 1,
  };
  saveGrids([grid]);
  return grid;
}

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
});

describe("PlayView", () => {
  it("redirects home when the grid id does not exist", () => {
    render(<PlayView id="missing" />);
    expect(window.location.hash).toBe("#home");
  });

  it("redirects home when other grids exist but not the requested one", () => {
    seedGrid({ id: "other" });
    render(<PlayView id="missing" />);
    expect(window.location.hash).toBe("#home");
  });

  it("navigates home via the back button", async () => {
    const user = userEvent.setup();
    seedGrid();
    render(<PlayView id="g1" />);
    await user.click(screen.getByRole("button", { name: /retour/i }));
    expect(window.location.hash).toBe("#home");
  });

  it("navigates to the editor via the edit button", async () => {
    const user = userEvent.setup();
    seedGrid();
    render(<PlayView id="g1" />);
    await user.click(screen.getByRole("button", { name: "Modifier" }));
    expect(window.location.hash).toBe("#editor/g1");
  });

  it("toggles a cell mark on click and persists it", async () => {
    const user = userEvent.setup();
    seedGrid();
    render(<PlayView id="g1" />);
    const cells = screen.getAllByRole("button", { name: /^[A-I]$/ });
    await user.click(cells[0]);
    expect(cells[0]).toHaveClass("marked");
    expect(loadGrids()[0].cells[0].marked).toBe(true);

    await user.click(cells[0]);
    expect(cells[0]).not.toHaveClass("marked");
  });

  it("does not toggle a free/GRATUIT cell", async () => {
    const user = userEvent.setup();
    seedGrid({
      size: 5,
      freeCenter: true,
      items: Array.from({ length: 24 }, (_, i) => `item-${i}`),
    });
    render(<PlayView id="g1" />);
    const freeCell = screen.getByText("GRATUIT").closest("button")!;
    expect(freeCell).toHaveClass("marked");
    await user.click(freeCell);
    expect(freeCell).toHaveClass("marked");
  });

  it("shows the bingo banner on a winning line and dismisses it on click", async () => {
    const user = userEvent.setup();
    seedGrid();
    render(<PlayView id="g1" />);
    const cells = screen.getAllByRole("button", { name: /^[A-I]$/ });
    await user.click(cells[0]);
    await user.click(cells[1]);
    await user.click(cells[2]);

    expect(await screen.findByText(/bingo !/i)).toBeInTheDocument();
    await user.click(screen.getByText(/bingo !/i));
    expect(screen.queryByText(/bingo !/i)).not.toBeInTheDocument();
  });

  it("keeps working locally if the grid was deleted elsewhere in the meantime", async () => {
    const user = userEvent.setup();
    seedGrid();
    render(<PlayView id="g1" />);
    saveGrids([]); // simulate deletion from another tab/session
    const cells = screen.getAllByRole("button", { name: /^[A-I]$/ });
    await user.click(cells[0]);
    expect(cells[0]).toHaveClass("marked");
    expect(loadGrids()).toHaveLength(0);
  });

  it("hides the banner again once the winning line is broken", async () => {
    const user = userEvent.setup();
    seedGrid();
    render(<PlayView id="g1" />);
    const cells = screen.getAllByRole("button", { name: /^[A-I]$/ });
    await user.click(cells[0]);
    await user.click(cells[1]);
    await user.click(cells[2]);
    expect(await screen.findByText(/bingo !/i)).toBeInTheDocument();

    await user.click(screen.getByText(/bingo !/i)); // dismiss
    await user.click(cells[0]); // unmark, breaking the row
    await user.click(cells[0]); // mark it again -> new win transition
    expect(await screen.findByText(/bingo !/i)).toBeInTheDocument();
  });

  it("reshuffles the grid on shuffle and resets marks (except free cells) on reset", async () => {
    const user = userEvent.setup();
    seedGrid();
    render(<PlayView id="g1" />);
    const before = loadGrids()[0].cells.map((c) => c.label);

    await user.click(screen.getByRole("button", { name: /remélanger/i }));
    const after = loadGrids()[0].cells.map((c) => c.label);
    expect(after.slice().sort()).toEqual(before.slice().sort());

    const cells = screen.getAllByRole("button", { name: /^[A-I]$/ });
    await user.click(cells[0]);
    expect(loadGrids()[0].cells.some((c) => c.marked)).toBe(true);

    await user.click(screen.getByRole("button", { name: /réinitialiser les coches/i }));
    expect(loadGrids()[0].cells.every((c) => !c.marked)).toBe(true);
  });

  it("keeps the free cell marked when resetting a grid with a free center", async () => {
    const user = userEvent.setup();
    seedGrid({
      size: 5,
      freeCenter: true,
      items: Array.from({ length: 24 }, (_, i) => `item-${i}`),
    });
    render(<PlayView id="g1" />);

    await user.click(screen.getByRole("button", { name: /réinitialiser les coches/i }));
    const grid = loadGrids()[0];
    expect(grid.cells.find((c) => c.free)?.marked).toBe(true);
    expect(grid.cells.filter((c) => !c.free).every((c) => !c.marked)).toBe(true);
  });
});
