import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
});

describe("App", () => {
  it("shows the empty state when there are no saved grids", () => {
    render(<App />);
    expect(screen.getByText(/aucune grille pour le moment/i)).toBeInTheDocument();
  });

  it("lets the user create a grid and mark a winning row", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /créer ma première grille/i }));
    await user.type(screen.getByPlaceholderText(/bingo réunion/i), "Test");
    await user.selectOptions(screen.getByRole("combobox"), "3");
    await user.type(
      screen.getByPlaceholderText(/écrivez chaque phrase/i),
      "A\nB\nC\nD\nE\nF\nG\nH\nI"
    );
    await user.click(screen.getByRole("button", { name: /générer la grille/i }));

    const cells = await screen.findAllByRole("button", { name: /^[A-I]$/ });
    expect(cells).toHaveLength(9);

    // Mark an entire row (the shuffled layout means we must discover a winning
    // triplet by marking three cells sharing a row/col/diagonal via the grid API).
    // Simpler: mark every cell, which always yields a win.
    for (const cell of cells) {
      await user.click(cell);
    }

    expect(await screen.findByText(/bingo !/i)).toBeInTheDocument();
  });

  it("falls back to the home view when the play route has no id", () => {
    window.location.hash = "play";
    render(<App />);
    expect(screen.getByText(/aucune grille pour le moment/i)).toBeInTheDocument();
  });
});
