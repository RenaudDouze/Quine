import { type FormEvent, useState } from "react";
import { isOddSize, neededCount, WIN_RULES, type WinRule } from "../lib/bingo";

export interface GridFormValues {
  size: number;
  freeCenter: boolean;
  winRule: WinRule;
  items: string[];
}

interface Props {
  initial?: Partial<GridFormValues>;
  submitLabel: string;
  onSubmit: (values: GridFormValues) => void;
}

/** Champs communs de création/édition d'une grille — partagés entre
 * EditorView (page, création) et EditModal (modale, édition d'une grille
 * existante), qui ne diffèrent que par leur emballage et ce qu'ils font du
 * résultat. Le titre ne fait pas partie de ce formulaire : comme dans +1, il
 * se gère depuis la modale Personnaliser (voir CustomizeModal). */
export default function GridForm({ initial, submitLabel, onSubmit }: Props) {
  const [size, setSize] = useState(initial?.size ?? 5);
  const [freeCenter, setFreeCenter] = useState(initial?.freeCenter ?? false);
  const [winRule, setWinRule] = useState<WinRule>(initial?.winRule ?? "line");
  const [itemsText, setItemsText] = useState((initial?.items ?? []).join("\n"));

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
    onSubmit({
      size,
      freeCenter: freeCenter && canFree,
      winRule,
      items: lines,
    });
  }

  return (
    <form className="editor" onSubmit={handleSubmit}>
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
      <p className={`hint ${lines.length < need ? "hint-error" : "hint-ok"}`} data-testid="count-hint">
        {lines.length < need
          ? `${lines.length} / ${need} cases renseignées — ajoutez encore ${need - lines.length} entrée(s).`
          : `${lines.length} / ${need} cases renseignées${lines.length > need ? " (le surplus sera pioché au hasard)" : ""} ✓`}
      </p>

      <div className="editor-actions">
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
