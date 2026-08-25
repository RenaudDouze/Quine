import { useEffect, useMemo, useState } from "react";
import { buildCells, checkWin, type Grid } from "../lib/bingo";
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

  // The banner stays dismissed until marking a cell (never unmarking one —
  // see toggleCell) newly completes a line that wasn't already accounted
  // for. Tying this directly to the action, inside the plain event handler
  // that performs it, avoids the pitfalls of deriving it from render or
  // effect state: a render can be started and discarded without committing
  // (React 19's concurrent features, StrictMode's dev double-invoke),
  // which previously desynced a ref-based transition check and could
  // permanently hide the banner on an actual win.
  const [dismissed, setDismissed] = useState(false);
  const bannerVisible = hasWin && !dismissed;

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
    const wasMarked = current.cells[i].marked;
    const cells = current.cells.map((c, idx) => (idx === i ? { ...c, marked: !c.marked } : c));

    // Marking (not unmarking) a cell can newly complete a line that wasn't
    // already part of the currently-won lines — e.g. finishing a second
    // line while the first stays marked, or re-completing a line that was
    // broken and re-marked. Only that case should bring a dismissed banner
    // back; unmarking a cell must never show it, even if it happens to
    // leave a *different*, already-won line as the only one still
    // complete (checkWin's winSet is the union of every complete line, so
    // its content can shrink on unmark without hasWin becoming false).
    if (!wasMarked) {
      const newWinSet = checkWin(cells, current.size).winSet;
      if ([...newWinSet].some((idx) => !winSet.has(idx))) {
        setDismissed(false);
      }
    }

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
        <div className="bingo-banner" onClick={() => setDismissed(true)}>
          <div className="bingo-banner-inner">
            <span>🎉 BINGO ! 🎉</span>
          </div>
        </div>
      )}
    </>
  );
}
