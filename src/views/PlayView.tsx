import { useEffect, useMemo, useState } from "react";
import { buildCells, checkWin, type Cell, type Grid } from "../lib/bingo";
import { loadGrids, saveGrids } from "../lib/storage";
import { now } from "../lib/time";
import { navigate } from "../hooks/useHashRoute";

interface Props {
  id: string;
}

export default function PlayView({ id }: Props) {
  const [grid, setGrid] = useState<Grid | undefined>(() =>
    loadGrids().find((g) => g.id === id)
  );

  // Runs once on mount: with `key={id}` on <PlayView>, a new id always
  // remounts this component, so there is nothing to re-check on updates.
  useEffect(() => {
    if (grid === undefined) {
      navigate("home");
    }
  }, [grid]);

  const { hasWin, winSet } = useMemo(
    () => (grid ? checkWin(grid.cells, grid.size) : { hasWin: false, winSet: new Set<number>() }),
    [grid]
  );

  // Show the banner whenever there's a win the player hasn't dismissed yet.
  // Dismissal is tied to the exact `cells` array that was showing when the
  // banner was closed: any further mark/unmark produces a new cells array
  // (see toggleCell/handleShuffle/handleReset below), so a fresh win after
  // dismissal naturally shows the banner again — no effect needed.
  const [dismissedCells, setDismissedCells] = useState<Cell[] | null>(null);
  const bannerVisible = hasWin && grid?.cells !== dismissedCells;

  if (!grid) return null;
  const current: Grid = grid;

  function persist(next: Grid) {
    const all = loadGrids();
    const idx = all.findIndex((g) => g.id === next.id);
    if (idx !== -1) {
      next.updatedAt = now();
      all[idx] = next;
      saveGrids(all);
    }
    setGrid(next);
  }

  function toggleCell(i: number) {
    if (current.cells[i].free) return;
    const cells = current.cells.map((c, idx) => (idx === i ? { ...c, marked: !c.marked } : c));
    persist({ ...current, cells });
  }

  function handleShuffle() {
    persist({ ...current, cells: buildCells(current.items, current.size, current.freeCenter) });
  }

  function handleReset() {
    const cells = current.cells.map((c) => (c.free ? c : { ...c, marked: false }));
    persist({ ...current, cells });
  }

  return (
    <>
      <header className="topbar">
        <button className="btn btn-ghost" onClick={() => navigate("home")}>
          ← Retour
        </button>
        <h1>{current.title}</h1>
        <button
          className="icon-btn"
          title="Modifier"
          aria-label="Modifier"
          onClick={() => navigate("editor", current.id)}
        >
          ✏️
        </button>
      </header>

      <div className="board-wrap">
        <div className="board" style={{ gridTemplateColumns: `repeat(${current.size}, 1fr)` }}>
          {current.cells.map((cell, i) => (
            <button
              key={i}
              className={[
                "cell",
                cell.marked && "marked",
                cell.free && "free",
                hasWin && winSet.has(i) && "win",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => toggleCell(i)}
            >
              <span className="cell-label">{cell.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="play-actions">
        <button className="btn btn-secondary" onClick={handleShuffle}>
          🔀 Remélanger
        </button>
        <button className="btn btn-secondary" onClick={handleReset}>
          ↺ Réinitialiser les coches
        </button>
      </div>

      {bannerVisible && (
        <div className="bingo-banner" onClick={() => setDismissedCells(current.cells)}>
          <div className="bingo-banner-inner">
            <span>🎉 BINGO ! 🎉</span>
          </div>
        </div>
      )}
    </>
  );
}
