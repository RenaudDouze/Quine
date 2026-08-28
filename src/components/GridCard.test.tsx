import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Reorder } from "framer-motion";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCells, type Grid } from "../lib/bingo";
import { downloadGridSvg } from "../lib/gridImage";
import GridCard from "./GridCard";

vi.mock("../lib/gridImage", () => ({
  downloadGridSvg: vi.fn(),
}));

function makeGrid(overrides: Partial<Grid> = {}): Grid {
  const size = overrides.size ?? 3;
  const freeCenter = overrides.freeCenter ?? false;
  const items = overrides.items ?? ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  return {
    id: "g1",
    title: "Ma grille",
    size,
    freeCenter,
    items,
    cells: overrides.cells ?? buildCells(items, size, freeCenter),
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

/** Reflète les mises à jour d'`onChange` dans un état local, comme le fait
 * HomeView en vrai : indispensable pour les scénarios multi-étapes (cocher
 * une case puis vérifier que le plateau affiché a bien changé). */
function renderCard(gridOverrides: Partial<Grid> = {}, draggable = true) {
  const initial = makeGrid(gridOverrides);
  const onChange = vi.fn();
  const onEdit = vi.fn();
  const onShare = vi.fn();
  const onCustomize = vi.fn();

  function Harness() {
    const [grid, setGrid] = useState(initial);
    return (
      <Reorder.Group as="div" values={[grid]} onReorder={() => {}}>
        <GridCard
          grid={grid}
          draggable={draggable}
          onChange={(next) => {
            onChange(next);
            setGrid(next);
          }}
          onEdit={onEdit}
          onShare={onShare}
          onCustomize={onCustomize}
        />
      </Reorder.Group>
    );
  }

  render(<Harness />);
  return { grid: initial, onChange, onEdit, onShare, onCustomize };
}

afterEach(() => {
  cleanup();
  vi.mocked(downloadGridSvg).mockClear();
});

describe("GridCard", () => {
  it("shows the title and size", () => {
    renderCard({ title: "Bingo réunion", size: 4, items: Array.from({ length: 16 }, (_, i) => `i${i}`) });
    expect(screen.getByText("Bingo réunion")).toBeInTheDocument();
    expect(screen.getByText(/4 × 4/)).toBeInTheDocument();
  });

  it("shows the free-center hint when set", () => {
    renderCard({
      size: 5,
      freeCenter: true,
      items: Array.from({ length: 24 }, (_, i) => `i${i}`),
    });
    expect(screen.getByText(/case libre/i)).toBeInTheDocument();
  });

  it("does not show the free-center hint when unset", () => {
    renderCard({ freeCenter: false });
    expect(screen.queryByText(/case libre/i)).not.toBeInTheDocument();
  });

  it.each(["blackout", "corners"] as const)('shows the win rule hint for "%s"', (winRule) => {
    renderCard({ winRule });
    expect(screen.getByText(winRule === "blackout" ? /carton plein/i : /quatre coins/i)).toBeInTheDocument();
  });

  it('does not show a win rule hint for the default "line" rule', () => {
    renderCard({ winRule: "line" });
    expect(screen.queryByText(/carton plein|quatre coins/i)).not.toBeInTheDocument();
  });

  it("does not show a win rule hint when unset", () => {
    renderCard();
    expect(screen.queryByText(/carton plein|quatre coins/i)).not.toBeInTheDocument();
  });

  it("calls onEdit when Modifier is clicked", async () => {
    const user = userEvent.setup();
    const { onEdit } = renderCard();
    await user.click(screen.getByRole("button", { name: "Modifier" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("calls onShare when Partager is clicked", async () => {
    const user = userEvent.setup();
    const { onShare } = renderCard();
    await user.click(screen.getByRole("button", { name: "Partager" }));
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it("calls onCustomize when Personnaliser is clicked", async () => {
    const user = userEvent.setup();
    const { onCustomize } = renderCard();
    await user.click(screen.getByRole("button", { name: "Personnaliser" }));
    expect(onCustomize).toHaveBeenCalledTimes(1);
  });

  it("shows a pin badge when the grid is pinned", () => {
    renderCard({ pinned: true });
    expect(screen.getByText("📌")).toBeInTheDocument();
  });

  it("does not show a pin badge when the grid is not pinned", () => {
    renderCard({ pinned: false });
    expect(screen.queryByText("📌")).not.toBeInTheDocument();
  });

  it("renders a background image layer when backgroundImageUrl is set", () => {
    renderCard({ backgroundImageUrl: "https://example.com/bg.jpg" });
    const bg = document.querySelector(".grid-item-bg") as HTMLElement;
    expect(bg).toBeInTheDocument();
    expect(bg.style.backgroundImage).toContain("https://example.com/bg.jpg");
  });

  it("does not render a background image layer when backgroundImageUrl is unset", () => {
    renderCard();
    expect(document.querySelector(".grid-item-bg")).not.toBeInTheDocument();
  });

  it("shows a drag handle when draggable", () => {
    renderCard({}, true);
    expect(screen.getByRole("button", { name: "Réordonner" })).toBeInTheDocument();
  });

  it("does not show a drag handle when not draggable", () => {
    renderCard({}, false);
    expect(screen.queryByRole("button", { name: "Réordonner" })).not.toBeInTheDocument();
  });

  it("does not call onChange when pressing down on the drag handle", () => {
    const { onChange } = renderCard({}, true);
    expect(() =>
      fireEvent.pointerDown(screen.getByRole("button", { name: "Réordonner" }))
    ).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("toggles a cell mark on click", async () => {
    const user = userEvent.setup();
    const { onChange } = renderCard();
    const cells = screen.getAllByRole("button", { name: /^[A-I]$/ });
    await user.click(cells[0]);
    expect(cells[0]).toHaveClass("marked");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cells: expect.any(Array) }));

    await user.click(cells[0]);
    expect(cells[0]).not.toHaveClass("marked");
  });

  it("does not toggle a free/GRATUIT cell", async () => {
    const user = userEvent.setup();
    renderCard({
      size: 5,
      freeCenter: true,
      items: Array.from({ length: 24 }, (_, i) => `item-${i}`),
    });
    const freeCell = screen.getByText("GRATUIT").closest("button")!;
    expect(freeCell).toHaveClass("marked");
    await user.click(freeCell);
    expect(freeCell).toHaveClass("marked");
  });

  it("shows the bingo banner on a winning line and dismisses it on click", async () => {
    const user = userEvent.setup();
    renderCard();
    const cells = screen.getAllByRole("button", { name: /^[A-I]$/ });
    await user.click(cells[0]);
    await user.click(cells[1]);
    await user.click(cells[2]);

    expect(await screen.findByText(/bingo !/i)).toBeInTheDocument();
    await user.click(screen.getByText(/bingo !/i));
    expect(screen.queryByText(/bingo !/i)).not.toBeInTheDocument();
  });

  it("hides the banner again once the winning line is broken", async () => {
    const user = userEvent.setup();
    renderCard();
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
    renderCard({ cells });
    expect(await screen.findByText(/bingo !/i)).toBeInTheDocument();
  });

  it("shows the banner again for a second line completed while the first stays marked", async () => {
    const user = userEvent.setup();
    renderCard();
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
    renderCard({ cells });
    expect(await screen.findByText(/bingo !/i)).toBeInTheDocument();

    await user.click(screen.getByText(/bingo !/i)); // dismiss
    const boardCells = screen.getAllByRole("button", { name: /^[A-I]$/ });
    await user.click(boardCells[3]); // unmark a cell in the middle row; the top row is still complete
    expect(screen.queryByText(/bingo !/i)).not.toBeInTheDocument();
  });

  it("keeps the dismissed banner hidden when toggling a cell outside the winning line", async () => {
    const user = userEvent.setup();
    renderCard();
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

  it("reshuffles the grid on shuffle and resets marks (except free cells) on reset, once confirmed", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { onChange } = renderCard();
    const before = screen.getAllByRole("button", { name: /^[A-I]$/ }).map((c) => c.textContent);

    await user.click(screen.getByRole("button", { name: /remélanger/i }));
    expect(confirmSpy).toHaveBeenCalledWith("Remélanger la grille ? Les cases cochées seront effacées.");
    const after = screen.getAllByRole("button", { name: /^[A-I]$/ }).map((c) => c.textContent);
    expect(after.slice().sort()).toEqual(before.slice().sort());

    const cells = screen.getAllByRole("button", { name: /^[A-I]$/ });
    await user.click(cells[0]);
    expect(cells[0]).toHaveClass("marked");

    await user.click(screen.getByRole("button", { name: /réinitialiser/i }));
    expect(confirmSpy).toHaveBeenCalledWith("Réinitialiser les coches ? Toutes les cases seront décochées.");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ cells: expect.arrayContaining([expect.objectContaining({ marked: false })]) })
    );
  });

  it("does not reshuffle when the confirmation is declined", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onChange } = renderCard();

    await user.click(screen.getByRole("button", { name: /remélanger/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not reset marks when the confirmation is declined", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderCard();
    const cells = screen.getAllByRole("button", { name: /^[A-I]$/ });
    await user.click(cells[0]);
    expect(cells[0]).toHaveClass("marked");

    vi.spyOn(window, "confirm").mockReturnValue(false);
    await user.click(screen.getByRole("button", { name: /réinitialiser/i }));
    expect(cells[0]).toHaveClass("marked");
  });

  it("keeps the free cell marked when resetting a grid with a free center", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderCard({
      size: 5,
      freeCenter: true,
      items: Array.from({ length: 24 }, (_, i) => `item-${i}`),
    });

    await user.click(screen.getByRole("button", { name: /réinitialiser/i }));
    expect(screen.getByText("GRATUIT").closest("button")).toHaveClass("marked");
    for (const cell of screen.getAllByRole("button", { name: /^item-/ })) {
      expect(cell).not.toHaveClass("marked");
    }
  });

  describe("condition de victoire personnalisée", () => {
    it('wins via "carton plein" only once every cell is marked, not from a single complete line', async () => {
      const user = userEvent.setup();
      renderCard({ winRule: "blackout" });
      const cells = screen.getAllByRole("button", { name: /^[A-I]$/ });

      await user.click(cells[0]);
      await user.click(cells[1]);
      await user.click(cells[2]);
      expect(screen.queryByText(/bingo !/i)).not.toBeInTheDocument();

      for (const cell of cells.slice(3)) {
        await user.click(cell);
      }
      expect(await screen.findByText(/bingo !/i)).toBeInTheDocument();
    });

    it('wins via "quatre coins" once all four corners are marked, not from an unrelated complete line', async () => {
      const user = userEvent.setup();
      renderCard({ winRule: "corners" });
      const cells = screen.getAllByRole("button", { name: /^[A-I]$/ });

      // Full top row (0, 1, 2): includes two corners (0, 2) but not a win yet.
      await user.click(cells[0]);
      await user.click(cells[1]);
      await user.click(cells[2]);
      expect(screen.queryByText(/bingo !/i)).not.toBeInTheDocument();

      // Corners of a 3x3 grid are 0, 2, 6, 8 — complete the remaining two.
      await user.click(cells[6]);
      await user.click(cells[8]);
      expect(await screen.findByText(/bingo !/i)).toBeInTheDocument();
    });
  });

  describe("export et impression", () => {
    it("downloads an SVG image of the grid when Exporter en image is clicked", async () => {
      const user = userEvent.setup();
      const { grid } = renderCard({ title: "À exporter" });
      await user.click(screen.getByRole("button", { name: "Exporter en image" }));

      expect(downloadGridSvg).toHaveBeenCalledTimes(1);
      expect(downloadGridSvg).toHaveBeenCalledWith(expect.objectContaining({ title: grid.title }));
    });

    it("calls window.print when Imprimer is clicked", async () => {
      const user = userEvent.setup();
      const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
      renderCard();
      await user.click(screen.getByRole("button", { name: "Imprimer" }));

      expect(printSpy).toHaveBeenCalledTimes(1);
      printSpy.mockRestore();
    });

    it("marks only this card for printing, and clears the mark after printing", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "print").mockImplementation(() => {});
      renderCard();
      const card = document.querySelector(".grid-item") as HTMLElement;
      expect(card).not.toHaveAttribute("data-printing");

      await user.click(screen.getByRole("button", { name: "Imprimer" }));
      expect(card).toHaveAttribute("data-printing", "true");

      fireEvent(window, new Event("afterprint"));
      expect(card).not.toHaveAttribute("data-printing");
    });
  });

  describe("couleur personnalisée", () => {
    it("applies the grid's custom color as --accent on the card", () => {
      renderCard({ color: "#db2777" });
      const card = document.querySelector(".grid-item") as HTMLElement;
      expect(card.style.getPropertyValue("--accent")).toBe("#db2777");
    });

    it("does not override the theme's accent when the grid has no custom color", () => {
      renderCard();
      const card = document.querySelector(".grid-item") as HTMLElement;
      expect(card.style.getPropertyValue("--accent")).toBe("");
    });
  });

  describe("confetti de victoire", () => {
    it("shows confetti when the banner first appears", async () => {
      const user = userEvent.setup();
      renderCard();
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
      renderCard({ cells });

      expect(await screen.findByText(/bingo !/i)).toBeInTheDocument();
      expect(document.querySelector(".bingo-celebration")).not.toBeInTheDocument();
    });

    it("auto-hides the confetti after the celebration duration", () => {
      vi.useFakeTimers();
      renderCard();
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
      renderCard();
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
