import { buildCells, type Grid } from "../lib/bingo";
import { pickColor } from "../lib/colors";
import { loadGrids, saveGrids, uid } from "../lib/storage";
import { now } from "../lib/time";
import { navigate } from "../hooks/useHashRoute";
import GridForm, { type GridFormValues } from "../components/GridForm";

export default function EditorView() {
  function handleSubmit(values: GridFormValues) {
    const grids = loadGrids();
    const timestamp = now();
    const grid: Grid = {
      id: uid(),
      title: values.title,
      size: values.size,
      freeCenter: values.freeCenter,
      items: values.items,
      cells: buildCells(values.items, values.size, values.freeCenter),
      createdAt: timestamp,
      updatedAt: timestamp,
      color: pickColor(grids.length),
      winRule: values.winRule,
    };
    grids.push(grid);
    saveGrids(grids);
    navigate("home");
  }

  return (
    <>
      <header className="topbar">
        <button className="btn btn-ghost" onClick={() => navigate("home")}>
          ← Retour
        </button>
        <h1>Nouvelle grille</h1>
      </header>

      <GridForm submitLabel="Générer la grille" onSubmit={handleSubmit} />
    </>
  );
}
