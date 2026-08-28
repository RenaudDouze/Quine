import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Grid } from "../lib/bingo";
import CustomizeModal from "./CustomizeModal";

function makeGrid(overrides: Partial<Grid> = {}): Grid {
  return {
    id: "g1",
    title: "Ma grille",
    size: 3,
    freeCenter: false,
    items: [],
    cells: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function renderModal(gridOverrides: Partial<Grid> = {}) {
  const grid = makeGrid(gridOverrides);
  const onClose = vi.fn();
  const onSetTitle = vi.fn();
  const onSetColor = vi.fn();
  const onSetBackgroundImage = vi.fn();
  const onTogglePin = vi.fn();
  const onToggleArchive = vi.fn();
  const onDuplicate = vi.fn();
  const onDelete = vi.fn();
  render(
    <CustomizeModal
      grid={grid}
      onClose={onClose}
      onSetTitle={onSetTitle}
      onSetColor={onSetColor}
      onSetBackgroundImage={onSetBackgroundImage}
      onTogglePin={onTogglePin}
      onToggleArchive={onToggleArchive}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
    />
  );
  return {
    grid,
    onClose,
    onSetTitle,
    onSetColor,
    onSetBackgroundImage,
    onTogglePin,
    onToggleArchive,
    onDuplicate,
    onDelete,
  };
}

afterEach(() => {
  cleanup();
});

describe("CustomizeModal", () => {
  it("shows the grid title in the heading", () => {
    renderModal({ title: "Grille du vendredi" });
    expect(screen.getByText('Personnaliser « Grille du vendredi »')).toBeInTheDocument();
  });

  it("closes when clicking the close button", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when clicking the overlay", () => {
    const { onClose } = renderModal();
    fireEvent.click(document.querySelector(".modal-overlay")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside the panel", () => {
    const { onClose } = renderModal();
    fireEvent.click(document.querySelector(".modal-panel")!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on an unrelated key", () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not show the locked hint for an active grid", () => {
    renderModal({ archived: false });
    expect(screen.queryByText(/lecture seule|archivée/i)).not.toBeInTheDocument();
  });

  it("shows a locked hint for an archived grid", () => {
    renderModal({ archived: true });
    expect(screen.getByText(/grille archivée/i)).toBeInTheDocument();
  });

  describe("nom", () => {
    it("affiche le titre actuel dans le champ", () => {
      renderModal({ title: "Mon titre" });
      expect(screen.getByDisplayValue("Mon titre")).toBeInTheDocument();
    });

    it("renomme au blur", () => {
      const { onSetTitle } = renderModal({ title: "Ancien" });
      const input = screen.getByDisplayValue("Ancien");
      fireEvent.change(input, { target: { value: "Nouveau" } });
      fireEvent.blur(input);
      expect(onSetTitle).toHaveBeenCalledWith("Nouveau");
    });

    it("renomme sur Entrée", () => {
      const { onSetTitle } = renderModal({ title: "Ancien" });
      const input = screen.getByDisplayValue("Ancien");
      fireEvent.change(input, { target: { value: "Nouveau" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onSetTitle).toHaveBeenCalledWith("Nouveau");
    });

    it("ignore une autre touche que Entrée", () => {
      const { onSetTitle } = renderModal({ title: "Ancien" });
      const input = screen.getByDisplayValue("Ancien");
      fireEvent.change(input, { target: { value: "Nouveau" } });
      fireEvent.keyDown(input, { key: "a" });
      expect(onSetTitle).not.toHaveBeenCalled();
    });

    it('remplace un titre vide (ou uniquement des espaces) par "Grille de bingo"', () => {
      const { onSetTitle } = renderModal({ title: "Ancien" });
      const input = screen.getByDisplayValue("Ancien");
      fireEvent.change(input, { target: { value: "   " } });
      fireEvent.blur(input);
      expect(onSetTitle).toHaveBeenCalledWith("Grille de bingo");
      expect(screen.getByDisplayValue("Grille de bingo")).toBeInTheDocument();
    });

    it("désactive le champ nom quand la grille est archivée", () => {
      renderModal({ archived: true, title: "Figée" });
      expect(screen.getByDisplayValue("Figée")).toBeDisabled();
    });
  });

  it("calls onSetColor when a swatch is clicked", async () => {
    const user = userEvent.setup();
    const { onSetColor } = renderModal();
    await user.click(screen.getByRole("button", { name: "Choisir la couleur #2563eb" }));
    expect(onSetColor).toHaveBeenCalledWith("#2563eb");
  });

  it("marks the current color swatch as selected", () => {
    renderModal({ color: "#7c3aed" });
    expect(screen.getByRole("button", { name: "Choisir la couleur #7c3aed" })).toHaveClass("selected");
  });

  it("disables color swatches when the grid is archived", () => {
    renderModal({ archived: true });
    expect(screen.getByRole("button", { name: "Choisir la couleur #2563eb" })).toBeDisabled();
  });

  it("pre-fills the background input with the current URL", () => {
    renderModal({ backgroundImageUrl: "https://example.com/bg.jpg" });
    expect(screen.getByPlaceholderText(/exemple.com/i)).toHaveValue("https://example.com/bg.jpg");
  });

  it("commits a valid background URL on blur", () => {
    const { onSetBackgroundImage } = renderModal();
    const input = screen.getByPlaceholderText(/exemple.com/i);
    fireEvent.change(input, { target: { value: "https://example.com/img.png" } });
    fireEvent.blur(input);
    expect(onSetBackgroundImage).toHaveBeenCalledWith("https://example.com/img.png");
  });

  it("commits a valid background URL on Enter", () => {
    const { onSetBackgroundImage } = renderModal();
    const input = screen.getByPlaceholderText(/exemple.com/i);
    fireEvent.change(input, { target: { value: "https://example.com/img.png" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSetBackgroundImage).toHaveBeenCalledWith("https://example.com/img.png");
  });

  it("does not commit on a key other than Enter", () => {
    const { onSetBackgroundImage } = renderModal();
    const input = screen.getByPlaceholderText(/exemple.com/i);
    fireEvent.change(input, { target: { value: "https://example.com/img.png" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(onSetBackgroundImage).not.toHaveBeenCalled();
  });

  it("shows an error and does not commit an invalid background URL", () => {
    const { onSetBackgroundImage } = renderModal();
    const input = screen.getByPlaceholderText(/exemple.com/i);
    fireEvent.change(input, { target: { value: "not a url" } });
    fireEvent.blur(input);
    expect(onSetBackgroundImage).not.toHaveBeenCalled();
    expect(screen.getByText(/url http\(s\) invalide/i)).toBeInTheDocument();
  });

  it("clears the error as soon as the input changes again", () => {
    renderModal();
    const input = screen.getByPlaceholderText(/exemple.com/i);
    fireEvent.change(input, { target: { value: "not a url" } });
    fireEvent.blur(input);
    expect(screen.getByText(/url http\(s\) invalide/i)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "still not a url but changed" } });
    expect(screen.queryByText(/url http\(s\) invalide/i)).not.toBeInTheDocument();
  });

  it("commits an empty background URL as undefined (no error)", () => {
    const { onSetBackgroundImage } = renderModal({ backgroundImageUrl: "https://example.com/bg.jpg" });
    const input = screen.getByPlaceholderText(/exemple.com/i);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(onSetBackgroundImage).toHaveBeenCalledWith(undefined);
    expect(screen.queryByText(/url http\(s\) invalide/i)).not.toBeInTheDocument();
  });

  it("shows a clear button once the background field has text, and clears it", async () => {
    const user = userEvent.setup();
    const { onSetBackgroundImage } = renderModal({ backgroundImageUrl: "https://example.com/bg.jpg" });
    await user.click(screen.getByRole("button", { name: "Vider l'image de fond" }));
    expect(onSetBackgroundImage).toHaveBeenCalledWith(undefined);
    expect(screen.getByPlaceholderText(/exemple.com/i)).toHaveValue("");
  });

  it("does not show a clear button when the background field is empty", () => {
    renderModal();
    expect(screen.queryByRole("button", { name: "Vider l'image de fond" })).not.toBeInTheDocument();
  });

  it("disables the background input and clear button when archived", () => {
    renderModal({ archived: true, backgroundImageUrl: "https://example.com/bg.jpg" });
    expect(screen.getByPlaceholderText(/exemple.com/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Vider l'image de fond" })).toBeDisabled();
  });

  it("pins the grid and closes when Épingler is clicked", async () => {
    const user = userEvent.setup();
    const { onTogglePin, onClose } = renderModal({ pinned: false });
    await user.click(screen.getByRole("button", { name: /Épingler en haut/ }));
    expect(onTogglePin).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("offers to unpin an already-pinned grid", async () => {
    const user = userEvent.setup();
    const { onTogglePin } = renderModal({ pinned: true });
    await user.click(screen.getByRole("button", { name: /Détacher cette grille/ }));
    expect(onTogglePin).toHaveBeenCalledTimes(1);
  });

  it("archives the grid and closes when Archiver is clicked", async () => {
    const user = userEvent.setup();
    const { onToggleArchive, onClose } = renderModal({ archived: false });
    await user.click(screen.getByRole("button", { name: /Archiver cette grille/ }));
    expect(onToggleArchive).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("offers to unarchive an already-archived grid", async () => {
    const user = userEvent.setup();
    const { onToggleArchive } = renderModal({ archived: true });
    await user.click(screen.getByRole("button", { name: /Désarchiver cette grille/ }));
    expect(onToggleArchive).toHaveBeenCalledTimes(1);
  });

  it("duplicates the grid and closes when Dupliquer is clicked", async () => {
    const user = userEvent.setup();
    const { onDuplicate, onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: /Dupliquer cette grille/ }));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("deletes the grid and closes when Supprimer is clicked", async () => {
    const user = userEvent.setup();
    const { onDelete, onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: /Supprimer cette grille/ }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
