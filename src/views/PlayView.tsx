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

  // Show the banner whenever the *set of cells forming a completed line*
  // changes to something new, and hide it otherwise. This one signature
  // covers every case:
  //  - toggling a cell that isn't part of any line doesn't change the
  //    signature, so a dismissed banner stays hidden (a real bug: comparing
  //    `grid.cells` by reference instead re-triggered on any toggle);
  //  - breaking a line then re-completing the exact same one goes through
  //    an empty signature in between, so it still counts as "new";
  //  - completing a second, different line while the first stays marked
  //    changes the signature (checkWin's winSet is the union of every
  //    complete line) even though `hasWin` never dips back to false, so it
  //    also re-shows the banner (a real bug: comparing just the `hasWin`
  //    boolean transition missed this case entirely).
  const winKey = hasWin ? [...winSet].sort((a, b) => a - b).join(",") : "";
  const [dismissed, setDismissed] = useState(false);
  const prevWinKeyRef = useRef(winKey);
  // This must be an effect, not a ref mutated during render: a render can
  // be started and discarded without committing (React 19's concurrent
  // features, StrictMode's dev double-invoke), and a discarded render
  // would still have mutated the ref, permanently losing the next real
  // change and hiding the banner on an actual win — that was a third real
  // bug, found by testing this exact scenario. An effect only runs after a
  // render actually commits, so it doesn't have that failure mode; oxlint's
  // set-state-in-effect rule flags it anyway, but this is a legitimate
  // "sync state to an external change" case, not the derivable-state
  // anti-pattern the rule is meant to catch.
  useEffect(() => {
    if (winKey !== prevWinKeyRef.current && winKey !== "") {
      // oxlint-disable-next-line react/set-state-in-effect -- see comment above
      setDismissed(false);
    }
    prevWinKeyRef.current = winKey;
  }, [winKey]);
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
