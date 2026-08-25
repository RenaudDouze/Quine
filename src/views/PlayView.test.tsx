import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    ...overrides,
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

  it("shows the banner immediately when mounting on an already-won grid", async () => {
    const items = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
    const cells = buildCells(items, 3, false).map((c, i) => ({
      ...c,
      marked: i < 3, // top row already complete, e.g. after a page reload
    }));
    seedGrid({ cells });
    render(<PlayView id="g1" />);
    expect(await screen.findByText(/bingo !/i)).toBeInTheDocument();
  });

  it("shows the banner again for a second line completed while the first stays marked", async () => {
    const user = userEvent.setup();
    seedGrid();
    render(<PlayView id="g1" />);
    const cells = screen.getAllByRole("button", { name: /^[A-I]$/ });
    await user.click(cells[0]);
    await user.click(cells[1]);
    await user.click(cells[2]); // completes the top row (0,1,2)
    expect(await screen.findByText(/bingo !/i)).toBeInTheDocument();

    await user.click(screen.getByText(/bingo !/i)); // dismiss
    // Complete the left column (0,3,6) too, without unmarking the row —
    // hasWin never dips back to false in between.
    await user.click(cells[3]);
    await user.click(cells[6]);
    expect(await screen.findByText(/bingo !/i)).toBeInTheDocument();
  });

  it("keeps the dismissed banner hidden when unmarking a cell, even if a different line stays complete", async () => {
    const user = userEvent.setup();
    const items = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
    // Both the top row (0,1,2) and the middle row (3,4,5) are already
    // complete at once.
    const cells = buildCells(items, 3, false).map((c, i) => ({ ...c, marked: i < 6 }));
    seedGrid({ cells });
    render(<PlayView id="g1" />);
    expect(await screen.findByText(/bingo !/i)).toBeInTheDocument();

    await user.click(screen.getByText(/bingo !/i)); // dismiss
    const boardCells = screen.getAllByRole("button", { name: /^[A-I]$/ });
    await user.click(boardCells[3]); // unmark a cell in the middle row; the top row is still complete
    expect(screen.queryByText(/bingo !/i)).not.toBeInTheDocument();
  });

  it("keeps the dismissed banner hidden when toggling a cell outside the winning line", async () => {
    const user = userEvent.setup();
    seedGrid();
    render(<PlayView id="g1" />);
    const cells = screen.getAllByRole("button", { name: /^[A-I]$/ });
    await user.click(cells[0]);
    await user.click(cells[1]);
    await user.click(cells[2]);
    expect(await screen.findByText(/bingo !/i)).toBeInTheDocument();

    await user.click(screen.getByText(/bingo !/i)); // dismiss
    await user.click(cells[3]); // mark an unrelated cell (still a win overall)
    expect(screen.queryByText(/bingo !/i)).not.toBeInTheDocument();
    await user.click(cells[3]); // unmark it again
    expect(screen.queryByText(/bingo !/i)).not.toBeInTheDocument();
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

  describe("couleur personnalisée", () => {
    it("applies the grid's custom color as the play screen's accent", () => {
      seedGrid({ color: "#db2777" });
      render(<PlayView id="g1" />);
      const wrapper = document.querySelector(".topbar")!.parentElement as HTMLElement;
      expect(wrapper.style.getPropertyValue("--accent")).toBe("#db2777");
    });

    it("does not override the theme's accent when the grid has no custom color", () => {
      seedGrid();
      render(<PlayView id="g1" />);
      const wrapper = document.querySelector(".topbar")!.parentElement as HTMLElement;
      expect(wrapper.style.getPropertyValue("--accent")).toBe("");
    });
  });

  describe("confetti de victoire", () => {
    it("shows confetti when the banner first appears", async () => {
      const user = userEvent.setup();
      seedGrid();
      render(<PlayView id="g1" />);
      const cells = screen.getAllByRole("button", { name: /^[A-I]$/ });
      await user.click(cells[0]);
      await user.click(cells[1]);
      await user.click(cells[2]);

      expect(await screen.findByText(/bingo !/i)).toBeInTheDocument();
      expect(document.querySelector(".bingo-celebration")).toBeInTheDocument();
    });

    it("does not show confetti when mounting on an already-won grid", async () => {
      const items = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
      const cells = buildCells(items, 3, false).map((c, i) => ({ ...c, marked: i < 3 }));
      seedGrid({ cells });
      render(<PlayView id="g1" />);

      expect(await screen.findByText(/bingo !/i)).toBeInTheDocument();
      expect(document.querySelector(".bingo-celebration")).not.toBeInTheDocument();
    });

    it("auto-hides the confetti after the celebration duration", () => {
      vi.useFakeTimers();
      seedGrid();
      render(<PlayView id="g1" />);
      const cells = screen.getAllByRole("button", { name: /^[A-I]$/ });
      fireEvent.click(cells[0]);
      fireEvent.click(cells[1]);
      fireEvent.click(cells[2]);

      expect(document.querySelector(".bingo-celebration")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      expect(document.querySelector(".bingo-celebration")).not.toBeInTheDocument();
      vi.useRealTimers();
    });

    it("shows confetti again for a second line completed after the first celebration ended", () => {
      vi.useFakeTimers();
      seedGrid();
      render(<PlayView id="g1" />);
      const cells = screen.getAllByRole("button", { name: /^[A-I]$/ });
      fireEvent.click(cells[0]);
      fireEvent.click(cells[1]);
      fireEvent.click(cells[2]); // completes the top row
      act(() => {
        vi.advanceTimersByTime(1100);
      });
      expect(document.querySelector(".bingo-celebration")).not.toBeInTheDocument();

      fireEvent.click(screen.getByText(/bingo !/i)); // dismiss
      fireEvent.click(cells[3]);
      fireEvent.click(cells[6]); // completes the left column too

      expect(document.querySelector(".bingo-celebration")).toBeInTheDocument();
      vi.useRealTimers();
    });
  });
});
