import { useEffect, useRef, useState } from "react";
import { Reorder } from "framer-motion";
import type { ThemePreference } from "../App";
import CustomizeModal from "../components/CustomizeModal";
import GridCard from "../components/GridCard";
import ShareModal from "../components/ShareModal";
import { matchesSearch, sortByPinned, type Grid } from "../lib/bingo";
import { loadGrids, saveGrids, uid } from "../lib/storage";
import { navigate } from "../hooks/useHashRoute";

const THEME_ICON: Record<ThemePreference, string> = { system: "🌓", light: "☀️", dark: "🌙" };
const THEME_LABEL: Record<ThemePreference, string> = { system: "Auto", light: "Clair", dark: "Sombre" };
const NEXT_THEME: Record<ThemePreference, ThemePreference> = { system: "light", light: "dark", dark: "system" };

const UNDO_TIMEOUT_MS = 5000;

interface Props {
  themePreference: ThemePreference;
  onThemePreferenceChange: (next: ThemePreference) => void;
}

export default function HomeView({ themePreference, onThemePreferenceChange }: Props) {
  const [grids, setGrids] = useState<Grid[]>(() => loadGrids());
  const [syncOpen, setSyncOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<Grid | null>(null);
  const [customizeTarget, setCustomizeTarget] = useState<Grid | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Bascule l'ensemble de la liste (archivées masquées par défaut) ; la
  // recherche filtre ensuite par titre à l'intérieur de la vue active.
  const [archiveView, setArchiveView] = useState<"active" | "archived">("active");

  // Garde un instantané des grilles avant une suppression, pour permettre de
  // l'annuler pendant quelques secondes via le message qui apparaît en bas
  // d'écran, plutôt qu'un `window.confirm()` bloquant avant l'action.
  const [undo, setUndo] = useState<{ label: string; grids: Grid[] } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Action rapide depuis un raccourci de l'app installée (?action=new|sync),
  // déclarés dans le manifest PWA (voir vite.config.ts).
  /* oxlint-disable react/set-state-in-effect -- synchronise avec l'URL au
     chargement (source externe), pas un état dérivable pendant le rendu */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    if (!action) return;

    const url = new URL(window.location.href);
    url.searchParams.delete("action");
    window.history.replaceState({}, "", url.toString());

    if (action === "new") navigate("editor");
    if (action === "sync") setSyncOpen(true);
  }, []);
  /* oxlint-enable react/set-state-in-effect */

  function persist(next: Grid[]) {
    saveGrids(next);
    setGrids(next);
  }

  function pushUndo(label: string) {
    setUndo({ label, grids });
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_TIMEOUT_MS);
  }

  // N'est rendu accessible que via le bouton du message d'annulation, qui
  // n'existe dans le DOM que lorsque `undo` est déjà défini.
  function handleUndo() {
    persist(undo!.grids);
    setUndo(null);
    clearTimeout(undoTimer.current);
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
  }

  const archivedCount = grids.filter((g) => g.archived).length;
  const filteredGrids = grids.filter(
    (g) => (archiveView === "archived" ? !!g.archived : !g.archived) && matchesSearch(g, searchQuery)
  );
  const sortedGrids = sortByPinned(filteredGrids);
  // Le glisser-déposer réordonne `sortedGrids` (le sous-ensemble affiché) et
  // enregistre directement ce résultat comme nouvelle liste complète : ça ne
  // reste cohérent que si ce sous-ensemble couvre déjà tout le reste (pas de
  // recherche, aucune grille archivée qui resterait en dehors du champ). Dans
  // tout autre cas la poignée est masquée pour éviter d'écraser silencieusement
  // le classement par un simple sous-ensemble filtré.
  const draggable = searchQuery.trim() === "" && filteredGrids.length === grids.length;

  function handleDuplicate(grid: Grid) {
    const copy: Grid = {
      ...JSON.parse(JSON.stringify(grid)),
      id: uid(),
      title: grid.title + " (copie)",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // Une copie ne doit pas hériter des préférences d'organisation de
      // l'originale : épinglée, elle bousculerait le haut de liste sans
      // qu'on l'ait demandé ; archivée, elle disparaîtrait aussitôt créée
      // dans l'onglet Archivées, sans indice visible pour l'utilisateur.
      pinned: false,
      archived: false,
    };
    persist([...grids, copy]);
  }

  function handleDelete(grid: Grid) {
    pushUndo(`Grille « ${grid.title} » supprimée`);
    persist(grids.filter((g) => g.id !== grid.id));
  }

  function handleImport(imported: Grid[], mode: "replace" | "merge") {
    persist(mode === "replace" ? imported : [...grids, ...imported]);
  }

  function setColor(id: string, color: string) {
    persist(grids.map((g) => (g.id === id ? { ...g, color } : g)));
  }

  function setBackgroundImage(id: string, url: string | undefined) {
    persist(grids.map((g) => (g.id === id ? { ...g, backgroundImageUrl: url } : g)));
  }

  function togglePin(id: string) {
    persist(grids.map((g) => (g.id === id ? { ...g, pinned: !g.pinned } : g)));
  }

  function toggleArchive(id: string) {
    persist(grids.map((g) => (g.id === id ? { ...g, archived: !g.archived } : g)));
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
          {grids.length > 0 && (
            <button
              className="icon-btn"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Rechercher"
              title="Rechercher"
            >
              🔍
            </button>
          )}
          <button
            className="icon-btn"
            onClick={() => setSyncOpen(true)}
            aria-label="Synchroniser mes grilles"
            title="Synchroniser mes grilles"
          >
            🔄
          </button>
          <button className="btn btn-chrome" onClick={() => navigate("editor")}>
            + Nouvelle grille
          </button>
        </div>
      </header>

      {(archivedCount > 0 || archiveView === "archived") && (
        <div className="archive-toggle" role="tablist" aria-label="Filtrer par statut">
          <button
            role="tab"
            aria-selected={archiveView === "active"}
            className={`archive-toggle-btn${archiveView === "active" ? " active" : ""}`}
            onClick={() => setArchiveView("active")}
          >
            Actives
          </button>
          <button
            role="tab"
            aria-selected={archiveView === "archived"}
            className={`archive-toggle-btn${archiveView === "archived" ? " active" : ""}`}
            onClick={() => setArchiveView("archived")}
          >
            Archivées{archivedCount > 0 ? ` (${archivedCount})` : ""}
          </button>
        </div>
      )}

      {searchOpen && grids.length > 0 && (
        <div className="search-bar">
          <input
            autoFocus
            type="text"
            placeholder="Rechercher une grille…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeSearch();
            }}
          />
          <button className="modal-close" onClick={closeSearch} aria-label="Fermer la recherche">
            ✕
          </button>
        </div>
      )}

      {filteredGrids.length === 0 ? (
        <div className="empty-state">
          {grids.length === 0 ? (
            <>
              <p>Aucune grille pour le moment.</p>
              <button className="btn btn-primary" onClick={() => navigate("editor")}>
                Créer ma première grille
              </button>
            </>
          ) : searchQuery.trim() !== "" ? (
            <p>Aucune grille ne correspond à « {searchQuery.trim()} ».</p>
          ) : archiveView === "archived" ? (
            <p>Aucune grille archivée.</p>
          ) : (
            <p>Toutes tes grilles sont archivées.</p>
          )}
        </div>
      ) : (
        <Reorder.Group as="div" axis="y" values={sortedGrids} onReorder={persist} className="grid-list">
          {sortedGrids.map((grid) => (
            <GridCard
              key={grid.id}
              grid={grid}
              draggable={draggable}
              onPlay={() => navigate("play", grid.id)}
              onEdit={() => navigate("editor", grid.id)}
              onShare={() => setShareTarget(grid)}
              onCustomize={() => setCustomizeTarget(grid)}
            />
          ))}
        </Reorder.Group>
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

      {customizeTarget && (
        <CustomizeModal
          grid={customizeTarget}
          onClose={() => setCustomizeTarget(null)}
          onSetColor={(color) => setColor(customizeTarget.id, color)}
          onSetBackgroundImage={(url) => setBackgroundImage(customizeTarget.id, url)}
          onTogglePin={() => togglePin(customizeTarget.id)}
          onToggleArchive={() => toggleArchive(customizeTarget.id)}
          onDuplicate={() => handleDuplicate(customizeTarget)}
          onDelete={() => handleDelete(customizeTarget)}
        />
      )}

      {undo && (
        <div className="undo-toast" role="status">
          <span>{undo.label}</span>
          <button onClick={handleUndo}>Annuler</button>
        </div>
      )}
    </>
  );
}
