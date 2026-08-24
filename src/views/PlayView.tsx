import { useEffect, useMemo, useRef, useState } from "react";
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

  // Show the banner on every fresh "not a win -> win" transition, and hide
  // it otherwise — including while the player keeps marking/unmarking cells
  // that don't complete a line, which must NOT bring a dismissed banner
  // back. That requires comparing hasWin against its value on the previous
  // render, which oxlint's react(refs) rule doesn't recognize as safe even
  // though it's React's own documented pattern for deriving state from a
  // previous render (see "Adjusting state when a prop changes" on
  // react.dev) — an effect here would also re-trigger a render, which the
  // set-state-in-effect rule flags for the same reason.
  const [dismissed, setDismissed] = useState(false);
  const prevHasWinRef = useRef(hasWin);
  /* oxlint-disable react/refs -- see comment above */
  if (prevHasWinRef.current !== hasWin) {
    prevHasWinRef.current = hasWin;
    if (hasWin) setDismissed(false);
  }
  /* oxlint-enable react/refs */
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
        <div className="bingo-banner" onClick={() => setDismissed(true)}>
          <div className="bingo-banner-inner">
            <span>🎉 BINGO ! 🎉</span>
          </div>
        </div>
      )}
    </>
  );
}
