import { useState } from "react";
import type { ThemePreference } from "../App";
import type { Grid } from "../lib/bingo";
import { loadGrids, saveGrids, uid } from "../lib/storage";
import { navigate } from "../hooks/useHashRoute";

const THEME_ICON: Record<ThemePreference, string> = { system: "🌓", light: "☀️", dark: "🌙" };
const THEME_LABEL: Record<ThemePreference, string> = { system: "Auto", light: "Clair", dark: "Sombre" };
const NEXT_THEME: Record<ThemePreference, ThemePreference> = { system: "light", light: "dark", dark: "system" };

interface Props {
  themePreference: ThemePreference;
  onThemePreferenceChange: (next: ThemePreference) => void;
}

export default function HomeView({ themePreference, onThemePreferenceChange }: Props) {
  const [grids, setGrids] = useState<Grid[]>(() =>
    loadGrids().sort((a, b) => b.updatedAt - a.updatedAt)
  );

  function refresh() {
    setGrids(loadGrids().sort((a, b) => b.updatedAt - a.updatedAt));
  }

  function handleDuplicate(grid: Grid) {
    const all = loadGrids();
    const copy: Grid = {
      ...JSON.parse(JSON.stringify(grid)),
      id: uid(),
      title: grid.title + " (copie)",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    all.push(copy);
    saveGrids(all);
    refresh();
  }

  function handleDelete(grid: Grid) {
    if (confirm(`Supprimer la grille "${grid.title}" ?`)) {
      saveGrids(loadGrids().filter((g) => g.id !== grid.id));
      refresh();
    }
  }

  return (
    <>
      <header className="topbar">
        <h1>🎉 Mes grilles</h1>
        <div className="topbar-actions">
          <button
            className="icon-btn"
            onClick={() => onThemePreferenceChange(NEXT_THEME[themePreference])}
            aria-label={`Thème : ${THEME_LABEL[themePreference]}`}
          >
            {THEME_ICON[themePreference]}
          </button>
          <button className="btn btn-primary" onClick={() => navigate("editor")}>
            + Nouvelle grille
          </button>
        </div>
      </header>

      {grids.length === 0 ? (
        <div className="empty-state">
          <p>Aucune grille pour le moment.</p>
          <button className="btn btn-primary" onClick={() => navigate("editor")}>
            Créer ma première grille
          </button>
        </div>
      ) : (
        <div className="grid-list">
          {grids.map((grid) => (
            <div className="grid-item" key={grid.id}>
              <button className="card" onClick={() => navigate("play", grid.id)}>
                <span className="card-title">{grid.title}</span>
                <span className="card-meta">
                  {grid.size} × {grid.size}
                  {grid.freeCenter ? " · case libre" : ""}
                </span>
              </button>
              <div className="card-actions">
                <button
                  className="icon-btn"
                  title="Modifier"
                  aria-label="Modifier"
                  onClick={() => navigate("editor", grid.id)}
                >
                  ✏️
                </button>
                <button
                  className="icon-btn"
                  title="Dupliquer"
                  aria-label="Dupliquer"
                  onClick={() => handleDuplicate(grid)}
                >
                  📋
                </button>
                <button
                  className="icon-btn icon-btn-danger"
                  title="Supprimer"
                  aria-label="Supprimer"
                  onClick={() => handleDelete(grid)}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
