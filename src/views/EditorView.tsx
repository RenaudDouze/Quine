import { type FormEvent, useMemo, useState } from "react";
import { buildCells, neededCount, type Grid } from "../lib/bingo";
import { loadGrids, saveGrids, uid } from "../lib/storage";
import { navigate } from "../hooks/useHashRoute";

interface Props {
  id?: string;
}

export default function EditorView({ id }: Props) {
  const existing = useMemo(() => (id ? loadGrids().find((g) => g.id === id) : undefined), [id]);

  const [title, setTitle] = useState(existing?.title ?? "");
  const [size, setSize] = useState(existing?.size ?? 5);
  const [freeCenter, setFreeCenter] = useState(existing?.freeCenter ?? false);
  const [itemsText, setItemsText] = useState((existing?.items ?? []).join("\n"));

  const canFree = size % 2 === 1;
  const need = neededCount(size, freeCenter && canFree);
  const lines = itemsText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  function handleSizeChange(next: number) {
    setSize(next);
    if (next % 2 === 0) setFreeCenter(false);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (lines.length < need) {
      return;
    }

    const finalTitle = title.trim() || "Grille de bingo";
    const grids = loadGrids();
    const now = Date.now();
    const effectiveFreeCenter = freeCenter && canFree;

    let grid: Grid;
    if (existing) {
      grid = grids.find((g) => g.id === existing.id)!;
      grid.title = finalTitle;
      grid.size = size;
      grid.freeCenter = effectiveFreeCenter;
      grid.items = lines;
      grid.cells = buildCells(lines, size, effectiveFreeCenter);
      grid.updatedAt = now;
    } else {
      grid = {
        id: uid(),
        title: finalTitle,
        size,
        freeCenter: effectiveFreeCenter,
        items: lines,
        cells: buildCells(lines, size, effectiveFreeCenter),
        createdAt: now,
        updatedAt: now,
      };
      grids.push(grid);
    }

    saveGrids(grids);
    navigate("play", grid.id);
  }

  return (
    <>
      <header className="topbar">
        <button
          className="btn btn-ghost"
          onClick={() => navigate(existing ? "play" : "home", existing?.id)}
        >
          ← Retour
        </button>
        <h1>{existing ? "Modifier la grille" : "Nouvelle grille"}</h1>
      </header>

      <form className="editor" onSubmit={handleSubmit}>
        <label className="field">
          <span>Titre de la grille</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex : Bingo réunion d'équipe"
            required
            maxLength={60}
          />
        </label>

        <label className="field">
          <span>Taille de la grille</span>
          <select value={size} onChange={(e) => handleSizeChange(Number(e.target.value))}>
            <option value={3}>3 × 3 (9 cases)</option>
            <option value={4}>4 × 4 (16 cases)</option>
            <option value={5}>5 × 5 (25 cases)</option>
          </select>
        </label>

        <label className="field checkbox-field">
          <input
            type="checkbox"
            checked={freeCenter && canFree}
            disabled={!canFree}
            onChange={(e) => setFreeCenter(e.target.checked)}
          />
          <span>Case centrale libre ("GRATUIT") — grilles de taille impaire</span>
        </label>

        <label className="field">
          <span>Vos cases (une par ligne)</span>
          <textarea
            rows={10}
            value={itemsText}
            onChange={(e) => setItemsText(e.target.value)}
            placeholder={
              'Écrivez chaque phrase ou mot sur une ligne...\nEx :\nQuelqu\'un dit "synergie"\nUn chien aboie\nCafé renversé'
            }
          />
        </label>
        <p
          className={`hint ${lines.length < need ? "hint-error" : "hint-ok"}`}
          data-testid="count-hint"
        >
          {lines.length < need
            ? `${lines.length} / ${need} cases renseignées — ajoutez encore ${need - lines.length} entrée(s).`
            : `${lines.length} / ${need} cases renseignées${lines.length > need ? " (le surplus sera pioché au hasard)" : ""} ✓`}
        </p>

        <div className="editor-actions">
          <button type="submit" className="btn btn-primary">
            Générer la grille
          </button>
        </div>
      </form>
    </>
  );
}
