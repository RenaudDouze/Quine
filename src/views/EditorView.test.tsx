import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Grid } from "../lib/bingo";
import { loadGrids, saveGrids } from "../lib/storage";
import EditorView from "./EditorView";

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
});

describe("EditorView — creating a grid", () => {
  it("does not create a grid when there are not enough items", async () => {
    const user = userEvent.setup();
    render(<EditorView />);
    await user.type(screen.getByPlaceholderText(/bingo réunion/i), "Incomplète");
    await user.selectOptions(screen.getByRole("combobox"), "3");
    await user.type(screen.getByPlaceholderText(/écrivez chaque phrase/i), "A\nB\nC");
    await user.click(screen.getByRole("button", { name: /générer la grille/i }));

    expect(window.location.hash).toBe("");
    expect(loadGrids()).toHaveLength(0);
  });

  it("navigates home when going back from a brand new grid", async () => {
    const user = userEvent.setup();
    render(<EditorView />);
    await user.click(screen.getByRole("button", { name: /retour/i }));
    expect(window.location.hash).toBe("#home");
  });

  it("falls back to a default title when none is provided", async () => {
    const user = userEvent.setup();
    render(<EditorView />);
    await user.selectOptions(screen.getByRole("combobox"), "3");
    await user.type(
      screen.getByPlaceholderText(/écrivez chaque phrase/i),
      "A\nB\nC\nD\nE\nF\nG\nH\nI"
    );
    // jsdom still enforces the native `required` attribute on submit,
    // so provide a title made only of spaces to exercise the trim() fallback.
    await user.type(screen.getByPlaceholderText(/bingo réunion/i), "   ");
    await user.click(screen.getByRole("button", { name: /générer la grille/i }));

    const grids = loadGrids();
    expect(grids).toHaveLength(1);
    expect(grids[0].title).toBe("Grille de bingo");
  });

  it("flags the surplus when more items are provided than needed", async () => {
    const user = userEvent.setup();
    render(<EditorView />);
    await user.selectOptions(screen.getByRole("combobox"), "3");
    await user.type(
      screen.getByPlaceholderText(/écrivez chaque phrase/i),
      "A\nB\nC\nD\nE\nF\nG\nH\nI\nJ"
    );
    expect(screen.getByTestId("count-hint")).toHaveTextContent(/surplus/i);
  });

  it("stores freeCenter=true when checked on an odd-sized grid", async () => {
    const user = userEvent.setup();
    render(<EditorView />);
    await user.type(screen.getByPlaceholderText(/bingo réunion/i), "Grille libre");
    await user.selectOptions(screen.getByRole("combobox"), "5");
    await user.click(screen.getByLabelText(/case centrale libre/i));
    await user.type(
      screen.getByPlaceholderText(/écrivez chaque phrase/i),
      Array.from({ length: 24 }, (_, i) => `item-${i}`).join("\n")
    );
    await user.click(screen.getByRole("button", { name: /générer la grille/i }));

    const grids = loadGrids();
    expect(grids[0].freeCenter).toBe(true);
    expect(grids[0].cells.some((c) => c.free)).toBe(true);
  });

  it("disables and unchecks the free-center option for an even size", async () => {
    const user = userEvent.setup();
    render(<EditorView />);
    await user.selectOptions(screen.getByRole("combobox"), "5");
    const checkbox = screen.getByLabelText(/case centrale libre/i);
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.selectOptions(screen.getByRole("combobox"), "4");
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeDisabled();
  });
});

describe("EditorView — editing an existing grid", () => {
  function seedGrid(): Grid {
    const grid: Grid = {
      id: "g1",
      title: "Ancien titre",
      size: 3,
      freeCenter: false,
      items: ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
      cells: [],
      createdAt: 1,
      updatedAt: 1,
    };
    saveGrids([grid]);
    return grid;
  }

  it("pre-fills the form with the existing grid", () => {
    seedGrid();
    render(<EditorView id="g1" />);
    expect(screen.getByPlaceholderText(/bingo réunion/i)).toHaveValue("Ancien titre");
    expect(screen.getByPlaceholderText(/écrivez chaque phrase/i)).toHaveValue(
      "A\nB\nC\nD\nE\nF\nG\nH\nI"
    );
  });

  it("navigates back to play (not home) when editing an existing grid", async () => {
    const user = userEvent.setup();
    seedGrid();
    render(<EditorView id="g1" />);
    await user.click(screen.getByRole("button", { name: /retour/i }));
    expect(window.location.hash).toBe("#play/g1");
  });

  it("updates the grid in place and redirects to play", async () => {
    const user = userEvent.setup();
    seedGrid();
    render(<EditorView id="g1" />);

    const titleInput = screen.getByPlaceholderText(/bingo réunion/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Nouveau titre");
    await user.click(screen.getByRole("button", { name: /générer la grille/i }));

    expect(window.location.hash).toBe("#play/g1");
    const grids = loadGrids();
    expect(grids).toHaveLength(1);
    expect(grids[0].title).toBe("Nouveau titre");
    expect(grids[0].cells).toHaveLength(9);
  });
});
