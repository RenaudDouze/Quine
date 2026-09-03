import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Grid } from "../lib/bingo";
import EditModal from "./EditModal";

function makeGrid(overrides: Partial<Grid> = {}): Grid {
  return {
    id: "g1",
    title: "Ancien titre",
    size: 3,
    freeCenter: false,
    items: ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
    cells: [],
    createdAt: 1,
    updatedAt: 1,
    color: "#db2777",
    ...overrides,
  };
}

function renderModal(gridOverrides: Partial<Grid> = {}) {
  const grid = makeGrid(gridOverrides);
  const onClose = vi.fn();
  const onSave = vi.fn();
  render(<EditModal grid={grid} onClose={onClose} onSave={onSave} />);
  return { grid, onClose, onSave };
}

afterEach(() => {
  cleanup();
});

describe("EditModal", () => {
  it("shows the grid's title in the heading", () => {
    renderModal({ title: "Grille de test" });
    expect(screen.getByText('Modifier « Grille de test »')).toBeInTheDocument();
  });

  describe("accessibility", () => {
    it("exposes a modal dialog, named by its title", () => {
      renderModal({ title: "Grille de test" });
      const dialog = screen.getByRole("dialog", { name: 'Modifier « Grille de test »' });
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("moves focus into the modal on mount", () => {
      renderModal();
      expect(screen.getByRole("button", { name: "Fermer" })).toHaveFocus();
    });

    it("restores focus to the triggering element on close", () => {
      const trigger = document.createElement("button");
      trigger.textContent = "Modifier";
      document.body.appendChild(trigger);
      trigger.focus();

      const { unmount } = render(<EditModal grid={makeGrid()} onClose={vi.fn()} onSave={vi.fn()} />);
      expect(trigger).not.toHaveFocus();

      unmount();
      expect(trigger).toHaveFocus();
      trigger.remove();
    });
  });

  it("pre-fills the form from the grid", () => {
    renderModal();
    expect(screen.getByPlaceholderText(/écrivez chaque phrase/i)).toHaveValue(
      "A\nB\nC\nD\nE\nF\nG\nH\nI"
    );
  });

  it('pre-fills the win rule select, defaulting to "line" when unset', () => {
    renderModal({ winRule: "corners" });
    expect(screen.getByRole("combobox", { name: /condition de victoire/i })).toHaveValue("corners");
  });

  it("shows Enregistrer as the submit label", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeInTheDocument();
  });

  it("closes without saving when the close button is clicked", async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderModal();
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("closes without saving when clicking the overlay", async () => {
    const user = userEvent.setup();
    const { onClose, onSave } = renderModal();
    await user.click(document.querySelector(".modal-overlay")!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not close when clicking inside the panel", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(document.querySelector(".modal-panel")!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes without saving on Escape", () => {
    const { onClose, onSave } = renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves the updated grid, preserving id/createdAt/color/title, and closes", async () => {
    const user = userEvent.setup();
    const { grid, onClose, onSave } = renderModal();
    await user.selectOptions(screen.getByRole("combobox", { name: /condition de victoire/i }), "corners");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as Grid;
    expect(saved.id).toBe(grid.id);
    expect(saved.createdAt).toBe(grid.createdAt);
    expect(saved.color).toBe(grid.color);
    expect(saved.title).toBe(grid.title);
    expect(saved.winRule).toBe("corners");
    expect(saved.updatedAt).not.toBe(grid.updatedAt);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("regenerates cells from the edited items and size", async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();
    await user.selectOptions(screen.getByRole("combobox", { name: /taille de la grille/i }), "3");
    const itemsInput = screen.getByPlaceholderText(/écrivez chaque phrase/i);
    await user.clear(itemsInput);
    await user.type(itemsInput, "J\nK\nL\nM\nN\nO\nP\nQ\nR");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    const saved = onSave.mock.calls[0][0] as Grid;
    expect(saved.items).toEqual(["J", "K", "L", "M", "N", "O", "P", "Q", "R"]);
    expect(saved.cells).toHaveLength(9);
    expect(saved.cells.map((c) => c.label).sort()).toEqual(
      ["J", "K", "L", "M", "N", "O", "P", "Q", "R"].sort()
    );
  });

  it("does not save when there are not enough items", async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = renderModal();
    const itemsInput = screen.getByPlaceholderText(/écrivez chaque phrase/i);
    await user.clear(itemsInput);
    await user.type(itemsInput, "A\nB\nC");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
