import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COLORS } from "../lib/colors";
import { loadGrids, saveGrids } from "../lib/storage";
import EditorView from "./EditorView";

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
});

describe("EditorView", () => {
  it("navigates home when going back", async () => {
    const user = userEvent.setup();
    render(<EditorView />);
    await user.click(screen.getByRole("button", { name: /retour/i }));
    expect(window.location.hash).toBe("#home");
  });

  async function generateGrid() {
    const user = userEvent.setup();
    render(<EditorView />);
    await user.selectOptions(screen.getByRole("combobox", { name: /taille de la grille/i }), "3");
    await user.type(
      screen.getByPlaceholderText(/écrivez chaque phrase/i),
      "A\nB\nC\nD\nE\nF\nG\nH\nI"
    );
    await user.click(screen.getByRole("button", { name: /générer la grille/i }));
  }

  it("creates and persists the grid, then navigates home", async () => {
    await generateGrid();
    expect(window.location.hash).toBe("#home");
    const grids = loadGrids();
    expect(grids).toHaveLength(1);
    expect(grids[0].cells).toHaveLength(9);
  });

  it("assigns a default title based on the number of existing grids, like +1's counters", async () => {
    saveGrids([
      { id: "a", title: "A", size: 3, freeCenter: false, items: [], cells: [], createdAt: 1, updatedAt: 1 },
    ]);
    await generateGrid();
    const created = loadGrids().find((g) => g.id !== "a");
    expect(created?.title).toBe("Grille 2");
  });

  it("assigns the first palette color to the first grid created", async () => {
    await generateGrid();
    expect(loadGrids()[0].color).toBe(COLORS[0]);
  });

  it("cycles through the color palette based on the number of existing grids", async () => {
    saveGrids([
      { id: "a", title: "A", size: 3, freeCenter: false, items: [], cells: [], createdAt: 1, updatedAt: 1 },
      { id: "b", title: "B", size: 3, freeCenter: false, items: [], cells: [], createdAt: 1, updatedAt: 1 },
    ]);
    await generateGrid();
    const created = loadGrids().find((g) => g.title === "Grille 3");
    expect(created?.color).toBe(COLORS[2]);
  });

  it('defaults the win rule to "line"', async () => {
    await generateGrid();
    expect(loadGrids()[0].winRule).toBe("line");
  });
});
