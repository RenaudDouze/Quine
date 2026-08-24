import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Grid } from "../lib/bingo";
import { loadGrids, saveGrids } from "../lib/storage";
import HomeView from "./HomeView";

function makeGrid(overrides: Partial<Grid> = {}): Grid {
  return {
    id: overrides.id ?? "grid-1",
    title: overrides.title ?? "Ma grille",
    size: overrides.size ?? 3,
    freeCenter: overrides.freeCenter ?? false,
    items: overrides.items ?? ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
    cells: overrides.cells ?? [],
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
  };
}

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
});

describe("HomeView", () => {
  it("navigates to the editor when creating a grid from the empty state", async () => {
    const user = userEvent.setup();
    render(<HomeView />);
    await user.click(screen.getByRole("button", { name: /créer ma première grille/i }));
    expect(window.location.hash).toBe("#editor");
  });

  it("navigates to the editor from the topbar button when grids exist", async () => {
    const user = userEvent.setup();
    saveGrids([makeGrid()]);
    render(<HomeView />);
    await user.click(screen.getByRole("button", { name: "+ Nouvelle grille" }));
    expect(window.location.hash).toBe("#editor");
  });

  it("sorts multiple grids by most recently updated first", () => {
    saveGrids([
      makeGrid({ id: "older", title: "Ancienne", updatedAt: 1 }),
      makeGrid({ id: "newer", title: "Récente", updatedAt: 2 }),
    ]);
    render(<HomeView />);
    const titles = screen.getAllByText(/Ancienne|Récente/).map((el) => el.textContent);
    expect(titles).toEqual(["Récente", "Ancienne"]);
  });

  it("shows the free-center hint in the card meta", () => {
    saveGrids([makeGrid({ freeCenter: true })]);
    render(<HomeView />);
    expect(screen.getByText(/case libre/i)).toBeInTheDocument();
  });

  it("navigates to play when a card is clicked", async () => {
    const user = userEvent.setup();
    saveGrids([makeGrid({ id: "g1" })]);
    render(<HomeView />);
    await user.click(screen.getByText("Ma grille"));
    expect(window.location.hash).toBe("#play/g1");
  });

  it("navigates to the editor with the grid id when editing", async () => {
    const user = userEvent.setup();
    saveGrids([makeGrid({ id: "g1" })]);
    render(<HomeView />);
    await user.click(screen.getByRole("button", { name: "Modifier" }));
    expect(window.location.hash).toBe("#editor/g1");
  });

  it("duplicates a grid and shows the copy", async () => {
    const user = userEvent.setup();
    saveGrids([makeGrid({ id: "g1", title: "Original" })]);
    render(<HomeView />);
    await user.click(screen.getByRole("button", { name: "Dupliquer" }));
    expect(screen.getByText("Original (copie)")).toBeInTheDocument();
    expect(loadGrids()).toHaveLength(2);
  });

  it("deletes a grid after confirmation", async () => {
    const user = userEvent.setup();
    saveGrids([makeGrid({ id: "g1", title: "À virer" })]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<HomeView />);
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(screen.queryByText("À virer")).not.toBeInTheDocument();
    expect(loadGrids()).toHaveLength(0);
  });

  it("keeps a grid when deletion is not confirmed", async () => {
    const user = userEvent.setup();
    saveGrids([makeGrid({ id: "g1", title: "À garder" })]);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<HomeView />);
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(screen.getByText("À garder")).toBeInTheDocument();
    expect(loadGrids()).toHaveLength(1);
  });
});
