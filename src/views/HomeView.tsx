import { useState } from "react";
import type { ThemePreference } from "../App";
import ShareModal from "../components/ShareModal";
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
  const [syncOpen, setSyncOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<Grid | null>(null);

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

  function handleImport(imported: Grid[], mode: "replace" | "merge") {
    saveGrids(mode === "replace" ? imported : [...loadGrids(), ...imported]);
    refresh();
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
          <button
            className="icon-btn"
            onClick={() => setSyncOpen(true)}
            aria-label="Synchroniser mes grilles"
            title="Synchroniser mes grilles"
          >
            🔄
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
                  className="icon-btn"
                  title="Partager"
                  aria-label="Partager"
                  onClick={() => setShareTarget(grid)}
                >
                  📤
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

      {syncOpen && (
        <ShareModal
          grids={grids}
          heading="Synchroniser mes grilles"
          hint="Scanne ce QR code depuis l'autre appareil, ou copie le lien."
          emptyHint="Ajoute au moins une grille pour générer un QR code."
          qrAlt="QR code de mes grilles"
          showJsonBackup
          onImport={handleImport}
          onClose={() => setSyncOpen(false)}
        />
      )}

      {shareTarget && (
        <ShareModal
          grids={[shareTarget]}
          heading={`Partager "${shareTarget.title}"`}
          hint="Scanne ce QR code, ou copie le lien pour que quelqu'un d'autre récupère cette grille."
          emptyHint="Impossible de générer un QR code."
          qrAlt={`QR code de la grille ${shareTarget.title}`}
          onClose={() => setShareTarget(null)}
        />
      )}
    </>
  );
}
