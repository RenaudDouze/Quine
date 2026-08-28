import { Reorder, useDragControls } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { buildCells, checkWin, WIN_RULES, type Grid } from "../lib/bingo";

interface Props {
  grid: Grid;
  draggable: boolean;
  onChange: (next: Grid) => void;
  onEdit: () => void;
  onShare: () => void;
  onCustomize: () => void;
}

// Durée d'affichage du confetti à l'apparition du bandeau Bingo.
const CELEBRATION_DURATION_MS = 1100;
// Éventail limité à la moitié supérieure, comme .counter-confetti dans +1 :
// contrairement à un bandeau plein écran, celui-ci reste posé sur SA carte,
// dont le bas est occupé par les boutons Remélanger/Réinitialiser.
const CONFETTI_ANGLES = [-90, -65, -40, -15, 15, 40, 65, 90, -110, 110];
const CONFETTI_COLORS = ["#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];

/** Comme les icônes de carte de +1 (⠿ ± ⚙ ↗ ⋯) : des glyphes monochromes,
 * pas des émojis colorés — un style neutre cohérent avec le reste du chrome
 * plutôt que des pictogrammes voyants. */
export default function GridCard({ grid, draggable, onChange, onEdit, onShare, onCustomize }: Props) {
  const dragControls = useDragControls();

  const { hasWin, winSet } = useMemo(() => checkWin(grid.cells, grid.size, grid.winRule), [grid]);

  // Le bandeau reste masqué tant qu'une case cochée (jamais décochée — voir
  // toggleCell) ne complète pas une ligne qui n'était pas déjà comptée.
  // Rattaché directement à l'action, dans le simple gestionnaire d'événement
  // qui l'effectue, plutôt que dérivé du rendu ou d'un effet : un rendu peut
  // démarrer puis être abandonné sans être commité (fonctionnalités
  // concurrentes de React 19, double-passage de StrictMode en dev), ce qui a
  // déjà désynchronisé une détection basée sur une ref et pouvait masquer
  // durablement le bandeau à une victoire pourtant réelle.
  const [dismissed, setDismissed] = useState(false);
  const bannerVisible = hasWin && !dismissed;

  // Célèbre l'apparition du bandeau (transition false → true), pas juste le
  // fait qu'il soit visible : sinon rouvrir une grille déjà gagnée
  // redéclencherait le confetti à chaque montage. `prevBannerVisible` capture
  // sa propre valeur précédente au fil des rendus (recalculée à chaque passage
  // de l'effet), donc le premier passage au montage compare la valeur initiale
  // à elle-même et ne célèbre jamais une victoire déjà acquise à l'ouverture.
  const [celebrating, setCelebrating] = useState(false);
  const prevBannerVisible = useRef(bannerVisible);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /* oxlint-disable react/set-state-in-effect -- réagit à la transition d'un
     état dérivé (bannerVisible), pas calculable pendant le rendu lui-même */
  useEffect(() => {
    const wasVisible = prevBannerVisible.current;
    prevBannerVisible.current = bannerVisible;
    if (!wasVisible && bannerVisible) {
      setCelebrating(true);
      clearTimeout(celebrateTimer.current);
      celebrateTimer.current = setTimeout(() => setCelebrating(false), CELEBRATION_DURATION_MS);
    }
  }, [bannerVisible]);
  /* oxlint-enable react/set-state-in-effect */

  function toggleCell(i: number) {
    if (grid.cells[i].free) return;
    const wasMarked = grid.cells[i].marked;
    const cells = grid.cells.map((c, idx) => (idx === i ? { ...c, marked: !c.marked } : c));

    // Marking (not unmarking) a cell can newly complete a line that wasn't
    // already part of the currently-won lines — e.g. finishing a second
    // line while the first stays marked, or re-completing a line that was
    // broken and re-marked. Only that case should bring a dismissed banner
    // back; unmarking a cell must never show it, even if it happens to
    // leave a *different*, already-won line as the only one still
    // complete (checkWin's winSet is the union of every complete line, so
    // its content can shrink on unmark without hasWin becoming false).
    if (!wasMarked) {
      const newWinSet = checkWin(cells, grid.size, grid.winRule).winSet;
      if ([...newWinSet].some((idx) => !winSet.has(idx))) {
        setDismissed(false);
      }
    }

    onChange({ ...grid, cells });
  }

  function handleShuffle() {
    if (!window.confirm("Remélanger la grille ? Les cases cochées seront effacées.")) return;
    onChange({ ...grid, cells: buildCells(grid.items, grid.size, grid.freeCenter) });
  }

  function handleReset() {
    if (!window.confirm("Réinitialiser les coches ? Toutes les cases seront décochées.")) return;
    const cells = grid.cells.map((c) => (c.free ? c : { ...c, marked: false }));
    onChange({ ...grid, cells });
  }

  return (
    <Reorder.Item
      as="div"
      value={grid}
      id={grid.id}
      data-grid-id={grid.id}
      dragListener={false}
      dragControls={dragControls}
      className="grid-item"
      style={{ "--card-accent": grid.color, "--accent": grid.color } as CSSProperties}
    >
      {grid.backgroundImageUrl && (
        <div
          className="grid-item-bg"
          style={{ backgroundImage: `url("${grid.backgroundImageUrl}")` }}
          aria-hidden="true"
        />
      )}

      <div className="grid-options-row">
        {draggable && (
          <button
            type="button"
            className="drag-handle"
            aria-label="Réordonner"
            title="Glisser pour réordonner"
            onPointerDown={(e) => dragControls.start(e)}
          >
            ⠿
          </button>
        )}
        <button className="icon-btn" title="Modifier" aria-label="Modifier" onClick={onEdit}>
          ✏
        </button>
        <button className="icon-btn" title="Partager" aria-label="Partager" onClick={onShare}>
          ↗
        </button>
        <button
          className="icon-btn"
          title="Personnaliser"
          aria-label="Personnaliser"
          onClick={onCustomize}
        >
          ⚙
        </button>
      </div>

      <h2 className="card-title">
        {grid.pinned && (
          <span className="card-pin" aria-label="Épinglée">
            📌
          </span>
        )}
        {grid.title}
      </h2>
      <span className="card-meta">
        {grid.size} × {grid.size}
        {grid.freeCenter ? " · case libre" : ""}
        {grid.winRule && grid.winRule !== "line"
          ? ` · ${WIN_RULES.find((r) => r.id === grid.winRule)?.label}`
          : ""}
      </span>

      <div className="board-wrap">
        <div className="board" style={{ gridTemplateColumns: `repeat(${grid.size}, 1fr)` }}>
          {grid.cells.map((cell, i) => (
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

      <div className="grid-actions-row">
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

      {celebrating && (
        <div className="bingo-celebration" aria-hidden="true">
          {CONFETTI_ANGLES.map((angle, i) => (
            <span
              key={angle}
              className="bingo-confetti"
              style={
                {
                  "--angle": `${angle}deg`,
                  "--delay": `${i * 25}ms`,
                  "--color": CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
    </Reorder.Item>
  );
}
