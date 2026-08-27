import { type FormEvent, useMemo, useState } from "react";
import { buildCells, isOddSize, neededCount, WIN_RULES, type Grid, type WinRule } from "../lib/bingo";
import { pickColor } from "../lib/colors";
import { loadGrids, saveGrids, uid } from "../lib/storage";
import { now } from "../lib/time";
import { navigate } from "../hooks/useHashRoute";

interface Props {
  id?: string;
}

export default function EditorView({ id }: Props) {
  const existing = useMemo(() => (id ? loadGrids().find((g) => g.id === id) : undefined), [id]);

  const [title, setTitle] = useState(existing?.title ?? "");
  const [size, setSize] = useState(existing?.size ?? 5);
  const [freeCenter, setFreeCenter] = useState(existing?.freeCenter ?? false);
  const [winRule, setWinRule] = useState<WinRule>(existing?.winRule ?? "line");
  const [itemsText, setItemsText] = useState((existing?.items ?? []).join("\n"));

  const canFree = isOddSize(size);
  const need = neededCount(size, freeCenter && canFree);
  const lines = itemsText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  function handleSizeChange(next: number) {
    setSize(next);
    if (!isOddSize(next)) setFreeCenter(false);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (lines.length < need) {
      return;
    }

    const finalTitle = title.trim() || "Grille de bingo";
    const grids = loadGrids();
    const timestamp = now();
    const effectiveFreeCenter = freeCenter && canFree;

    let grid: Grid;
    if (existing) {
      grid = grids.find((g) => g.id === existing.id)!;
      grid.title = finalTitle;
      grid.size = size;
      grid.freeCenter = effectiveFreeCenter;
      grid.items = lines;
      grid.cells = buildCells(lines, size, effectiveFreeCenter);
      grid.winRule = winRule;
      grid.updatedAt = timestamp;
    } else {
      grid = {
        id: uid(),
        title: finalTitle,
        size,
        freeCenter: effectiveFreeCenter,
        items: lines,
        cells: buildCells(lines, size, effectiveFreeCenter),
        createdAt: timestamp,
        updatedAt: timestamp,
        color: pickColor(grids.length),
        winRule,
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
          <span>Condition de victoire</span>
          <select value={winRule} onChange={(e) => setWinRule(e.target.value as WinRule)}>
            {WIN_RULES.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.label}
              </option>
            ))}
          </select>
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
