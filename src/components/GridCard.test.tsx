import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Reorder } from "framer-motion";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Grid } from "../lib/bingo";
import GridCard from "./GridCard";

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

function renderCard(gridOverrides: Partial<Grid> = {}, draggable = true) {
  const grid = makeGrid(gridOverrides);
  const onPlay = vi.fn();
  const onEdit = vi.fn();
  const onShare = vi.fn();
  const onCustomize = vi.fn();
  render(
    <Reorder.Group as="div" values={[grid]} onReorder={() => {}}>
      <GridCard
        grid={grid}
        draggable={draggable}
        onPlay={onPlay}
        onEdit={onEdit}
        onShare={onShare}
        onCustomize={onCustomize}
      />
    </Reorder.Group>
  );
  return { grid, onPlay, onEdit, onShare, onCustomize };
}

afterEach(() => {
  cleanup();
});

describe("GridCard", () => {
  it("shows the title and size", () => {
    renderCard({ title: "Bingo réunion", size: 4 });
    expect(screen.getByText("Bingo réunion")).toBeInTheDocument();
    expect(screen.getByText(/4 × 4/)).toBeInTheDocument();
  });

  it("shows the free-center hint when set", () => {
    renderCard({ freeCenter: true });
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

  it("calls onPlay when the card is clicked", async () => {
    const user = userEvent.setup();
    const { onPlay } = renderCard();
    await user.click(screen.getByText("Ma grille"));
    expect(onPlay).toHaveBeenCalledTimes(1);
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

  it("does not navigate when pressing down on the drag handle", () => {
    const { onPlay } = renderCard({}, true);
    expect(() =>
      fireEvent.pointerDown(screen.getByRole("button", { name: "Réordonner" }))
    ).not.toThrow();
    expect(onPlay).not.toHaveBeenCalled();
  });
});
