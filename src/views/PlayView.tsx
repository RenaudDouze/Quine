import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { buildCells, checkWin, type Grid } from "../lib/bingo";
import { downloadGridSvg } from "../lib/gridImage";
import { loadGrids, saveGrids } from "../lib/storage";
import { now } from "../lib/time";
import { navigate } from "../hooks/useHashRoute";

interface Props {
  id: string;
}

// Durée d'affichage du confetti à l'apparition du bandeau Bingo.
const CELEBRATION_DURATION_MS = 1100;
// Angles (en degrés) des particules du confetti, réparties en éventail sur
// un cercle complet : contrairement à une carte de compteur, le bandeau
// occupe tout l'écran, rien à éviter dans un coin précis.
const CONFETTI_ANGLES = [-90, -65, -40, -15, 15, 40, 65, 90, -110, 110, -135, 135, -155, 155, 180, 0];
const CONFETTI_COLORS = ["#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];

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
    () =>
      grid
        ? checkWin(grid.cells, grid.size, grid.winRule)
        : { hasWin: false, winSet: new Set<number>() },
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

  // Masque l'en-tête et les actions pour ne garder que la grille à l'écran
  // (utile pour projeter une grille sur une TV pendant un événement), et
  // passe en plein écran natif quand c'est supporté (absent sur Safari iOS,
  // où le masquage de l'en-tête reste quand même utile seul).
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    if (focusMode) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [focusMode]);

  // Synchronise l'état si le plein écran natif est quitté autrement que par
  // notre bouton (ex : touche Échap gérée nativement par le navigateur).
  /* oxlint-disable react/set-state-in-effect -- réagit à un événement externe
     au navigateur (sortie du plein écran natif), pas dérivable au rendu */
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setFocusMode(false);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Filet de sécurité pour les navigateurs sans API Fullscreen (ex : Safari
  // iOS) : l'événement `fullscreenchange` ci-dessus n'y est jamais émis.
  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusMode(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [focusMode]);
  /* oxlint-enable react/set-state-in-effect */

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
      const newWinSet = checkWin(cells, current.size, current.winRule).winSet;
      if ([...newWinSet].some((idx) => !winSet.has(idx))) {
        setDismissed(false);
      }
    }

    persist({ ...current, cells });
  }

  function handleShuffle() {
    if (!window.confirm("Remélanger la grille ? Les cases cochées seront effacées.")) return;
    persist({ ...current, cells: buildCells(current.items, current.size, current.freeCenter) });
  }

  function handleReset() {
    if (!window.confirm("Réinitialiser les coches ? Toutes les cases seront décochées.")) return;
    const cells = current.cells.map((c) => (c.free ? c : { ...c, marked: false }));
    persist({ ...current, cells });
  }

  // Reprend la couleur choisie pour cette grille (voir le panneau
  // « Personnaliser ») dans le design de l'écran de jeu : cases cochées et
  // bandeau de victoire. `undefined` (pas de couleur perso) est omis par
  // React du style rendu, ce qui laisse simplement l'accent du thème
  // s'appliquer normalement. `display: contents` garde le layout flex du
  // parent (`#root`) inchangé — ce wrapper n'existe que pour porter la
  // variable CSS, pas pour générer sa propre boîte.
  return (
    <div style={{ display: "contents", "--accent": current.color } as CSSProperties}>
      {focusMode && (
        <button
          className="focus-exit-btn"
          onClick={() => setFocusMode(false)}
          aria-label="Quitter le mode plein écran"
        >
          ✕
        </button>
      )}

      {!focusMode && (
        <header className="topbar">
          <button className="btn btn-ghost" onClick={() => navigate("home")}>
            ← Retour
          </button>
          <h1>{current.title}</h1>
          <div className="topbar-actions">
            <button
              className="icon-btn"
              title="Mode plein écran"
              aria-label="Mode plein écran"
              onClick={() => setFocusMode(true)}
            >
              ⛶
            </button>
            <button
              className="icon-btn"
              title="Exporter en image"
              aria-label="Exporter en image"
              onClick={() => downloadGridSvg(current)}
            >
              🖼️
            </button>
            <button
              className="icon-btn"
              title="Imprimer"
              aria-label="Imprimer"
              onClick={() => window.print()}
            >
              🖨️
            </button>
            <button
              className="icon-btn"
              title="Modifier"
              aria-label="Modifier"
              onClick={() => navigate("editor", current.id)}
            >
              ✏️
            </button>
          </div>
        </header>
      )}

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

      {!focusMode && (
        <div className="play-actions">
          <button className="btn btn-secondary" onClick={handleShuffle}>
            🔀 Remélanger
          </button>
          <button className="btn btn-secondary" onClick={handleReset}>
            ↺ Réinitialiser les coches
          </button>
        </div>
      )}

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
    </div>
  );
}
