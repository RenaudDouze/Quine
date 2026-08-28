import { Reorder, useDragControls } from "framer-motion";
import type { CSSProperties } from "react";
import { WIN_RULES, type Grid } from "../lib/bingo";

interface Props {
  grid: Grid;
  draggable: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onShare: () => void;
  onCustomize: () => void;
}

export default function GridCard({ grid, draggable, onPlay, onEdit, onShare, onCustomize }: Props) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      as="div"
      value={grid}
      id={grid.id}
      dragListener={false}
      dragControls={dragControls}
      className="grid-item"
      style={{ "--card-accent": grid.color } as CSSProperties}
    >
      {grid.backgroundImageUrl && (
        <div
          className="grid-item-bg"
          style={{ backgroundImage: `url("${grid.backgroundImageUrl}")` }}
          aria-hidden="true"
        />
      )}

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

      <button className="card" onClick={onPlay}>
        <span className="card-title">
          {grid.pinned && (
            <span className="card-pin" aria-label="Épinglée">
              📌
            </span>
          )}
          {grid.title}
        </span>
        <span className="card-meta">
          {grid.size} × {grid.size}
          {grid.freeCenter ? " · case libre" : ""}
          {grid.winRule && grid.winRule !== "line"
            ? ` · ${WIN_RULES.find((r) => r.id === grid.winRule)?.label}`
            : ""}
        </span>
      </button>

      {/* Comme les icônes de carte de +1 (⠿ ± ⚙ ↗ ⋯) : des glyphes
          monochromes, pas des émojis colorés — un style neutre cohérent
          avec le reste du chrome plutôt que des pictogrammes voyants. */}
      <div className="card-actions">
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
    </Reorder.Item>
  );
}
