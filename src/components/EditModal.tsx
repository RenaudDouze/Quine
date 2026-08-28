import { useEffect } from "react";
import { buildCells, type Grid } from "../lib/bingo";
import { now } from "../lib/time";
import GridForm, { type GridFormValues } from "./GridForm";

interface Props {
  grid: Grid;
  onClose: () => void;
  onSave: (next: Grid) => void;
}

export default function EditModal({ grid, onClose, onSave }: Props) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleSubmit(values: GridFormValues) {
    onSave({
      ...grid,
      size: values.size,
      freeCenter: values.freeCenter,
      items: values.items,
      cells: buildCells(values.items, values.size, values.freeCenter),
      winRule: values.winRule,
      updatedAt: now(),
    });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-panel-header">
          <h2>Modifier « {grid.title} »</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        <GridForm
          initial={{
            size: grid.size,
            freeCenter: grid.freeCenter,
            winRule: grid.winRule ?? "line",
            items: grid.items,
          }}
          submitLabel="Enregistrer"
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}
