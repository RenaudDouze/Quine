import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Reorder } from "framer-motion";
import type { ThemePreference } from "../App";
import CustomizeModal from "../components/CustomizeModal";
import EditModal from "../components/EditModal";
import GridCard from "../components/GridCard";
import { buildCells, matchesSearch, sortByPinned, type Grid } from "../lib/bingo";
import { loadGrids, saveGrids, uid } from "../lib/storage";
import { now } from "../lib/time";
import { navigate } from "../hooks/useHashRoute";
import { useRemoteSync } from "../hooks/useRemoteSync";
import { ErrorBoundary } from "../components/ErrorBoundary";
import {
  ArchiveIcon,
  CloseIcon,
  EyeIcon,
  FullscreenIcon,
  MoonIcon,
  MoreIcon,
  SearchIcon,
  SunIcon,
  SyncIcon,
  ThemeAutoIcon,
  type IconProps,
} from "../components/icons";

// Chargé à la demande : n'entre dans le bundle initial que si une modale de
// partage/synchronisation est effectivement ouverte (embarque la dépendance
// qrcode), comme SyncPanel dans +1.
const ShareModal = lazy(() => import("../components/ShareModal"));

const THEME_ICON: Record<ThemePreference, ComponentType<IconProps>> = {
  system: ThemeAutoIcon,
  light: SunIcon,
  dark: MoonIcon,
};
const THEME_LABEL: Record<ThemePreference, string> = { system: "Auto", light: "Clair", dark: "Sombre" };
const NEXT_THEME: Record<ThemePreference, ThemePreference> = { system: "light", light: "dark", dark: "system" };

type ArchiveView = "active" | "archived";
const ARCHIVE_VIEW_ICON: Record<ArchiveView, ComponentType<IconProps>> = { active: EyeIcon, archived: ArchiveIcon };
const NEXT_ARCHIVE_VIEW: Record<ArchiveView, ArchiveView> = { active: "archived", archived: "active" };

const UNDO_TIMEOUT_MS = 5000;
const SYNC_NOTICE_TIMEOUT_MS = 4000;

// Filet de secours générique pour une modale qui plante à l'affichage : sans
// lui, une exception non rattrapée n'importe où dans son sous-arbre démonte
// toute l'app en page blanche — voir ErrorBoundary.tsx. `message` distingue
// deux causes : un chunk JS chargé à la demande (ShareModal) introuvable
// après un déploiement (`Suspense` seul ne rattrape que l'attente du chunk,
// pas son échec), d'un bug de rendu plus générique dans une modale du bundle
// principal (CustomizeModal, EditModal — jamais concernées par un chunk
// manquant, mais tout aussi capables de planter).
function modalCrashFallback(heading: string, message: string, onClose: () => void) {
  return (retry: () => void) => (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-panel-header">
          <h2>{heading}</h2>
        </div>
        <p className="modal-hint">{message}</p>
        <div className="modal-row">
          <button className="modal-btn" onClick={retry}>
            Recharger la page
          </button>
          <button className="modal-btn" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

const CHUNK_LOAD_FAILED_MESSAGE =
  "Ce panneau n'a pas pu se charger — une nouvelle version de l'app est probablement disponible. Recharge la page pour la récupérer.";
const MODAL_CRASH_MESSAGE = "Une erreur est survenue en affichant cette fenêtre. Recharge la page pour continuer.";

interface Props {
  themePreference: ThemePreference;
  onThemePreferenceChange: (next: ThemePreference) => void;
}

export default function HomeView({ themePreference, onThemePreferenceChange }: Props) {
  const [grids, setGrids] = useState<Grid[]>(() => loadGrids());
  const [syncOpen, setSyncOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<Grid | null>(null);
  const [customizeTarget, setCustomizeTarget] = useState<Grid | null>(null);
  const [editTarget, setEditTarget] = useState<Grid | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Bascule l'ensemble de la liste (archivées masquées par défaut) ; la
  // recherche filtre ensuite par titre à l'intérieur de la vue active.
  const [archiveView, setArchiveView] = useState<ArchiveView>("active");

  // Recherche, thème, synchronisation, plein écran et filtre archivées
  // vivent dans ce menu déroulant, replié par défaut derrière le bouton ⋯,
  // comme dans +1. Contrairement à ces actions, « + Nouvelle grille » reste
  // toujours visible dans l'en-tête : c'est l'action la plus fréquente, elle
  // ne doit pas se cacher derrière un clic supplémentaire.
  const [menuOpen, setMenuOpen] = useState(false);

  // Garde un instantané des grilles avant une suppression, pour permettre de
  // l'annuler pendant quelques secondes via le message qui apparaît en bas
  // d'écran, plutôt qu'un `window.confirm()` bloquant avant l'action.
  const [undo, setUndo] = useState<{ label: string; grids: Grid[] } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Message éphémère affiché quand des grilles arrivent d'un autre appareil
  // pendant que l'app est déjà ouverte (voir useRemoteSync, onRemoteUpdate) :
  // seul indice visible en dehors de la modale Synchroniser qu'une mise à
  // jour vient d'être reçue.
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const syncNoticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function showSyncNotice() {
    setSyncNotice("Grilles mises à jour depuis un autre appareil");
    clearTimeout(syncNoticeTimer.current);
    syncNoticeTimer.current = setTimeout(() => setSyncNotice(null), SYNC_NOTICE_TIMEOUT_MS);
  }
  // Absent (fonctionnalité non configurée) tant que le worker de synchro n'a
  // pas été déployé et sa variable d'environnement renseignée au build — voir
  // worker/README.md. `useRemoteSync` reste alors inerte (aucun appel réseau).
  const remoteSync = useRemoteSync(import.meta.env.VITE_SYNC_WORKER_URL, grids, persist, showSyncNotice);

  // Masque l'en-tête (titre, icônes, recherche, filtre archivés) pour ne
  // garder que la liste de grilles à l'écran (utile pour la projeter sur une
  // TV pendant un événement), et passe en plein écran natif quand c'est
  // supporté (absent sur Safari iOS, où le masquage de l'en-tête reste quand
  // même utile seul). Même logique que PlayView.
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

  // Mémoïsés : recalculés à chaque rendu sinon, y compris pour des
  // changements sans rapport (ex : bascule de thème), comme dans +1.
  const archivedCount = useMemo(() => grids.filter((g) => g.archived).length, [grids]);
  const filteredGrids = useMemo(
    () =>
      grids.filter(
        (g) => (archiveView === "archived" ? !!g.archived : !g.archived) && matchesSearch(g, searchQuery)
      ),
    [grids, archiveView, searchQuery]
  );
  const sortedGrids = useMemo(() => sortByPinned(filteredGrids), [filteredGrids]);
  // Le glisser-déposer réordonne `sortedGrids` (le sous-ensemble affiché) et
  // enregistre directement ce résultat comme nouvelle liste complète : ça ne
  // reste cohérent que si ce sous-ensemble couvre déjà tout le reste (pas de
  // recherche, aucune grille archivée qui resterait en dehors du champ). Dans
  // tout autre cas la poignée est masquée pour éviter d'écraser silencieusement
  // le classement par un simple sous-ensemble filtré.
  const draggable = searchQuery.trim() === "" && filteredGrids.length === grids.length;

  function handleDuplicate(grid: Grid) {
    const timestamp = now();
    const copy: Grid = {
      ...JSON.parse(JSON.stringify(grid)),
      id: uid(),
      title: grid.title + " (copie)",
      createdAt: timestamp,
      updatedAt: timestamp,
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

  function updateGrid(next: Grid) {
    persist(grids.map((g) => (g.id === next.id ? { ...next, updatedAt: now() } : g)));
  }

  // Applique un patch de champs à une seule grille, identifiée par son id.
  // Point d'entrée commun à tous les réglages simples (titre, couleur, image
  // de fond...) qui remplacent juste un ou plusieurs champs sans logique
  // additionnelle, comme updateCounter dans +1.
  function patchGrid(id: string, patch: Partial<Grid>) {
    persist(grids.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function shuffleGrid(id: string) {
    persist(
      grids.map((g) =>
        g.id === id ? { ...g, cells: buildCells(g.items, g.size, g.freeCenter) } : g
      )
    );
  }

  function resetGrid(id: string) {
    persist(
      grids.map((g) =>
        g.id === id ? { ...g, cells: g.cells.map((c) => (c.free ? c : { ...c, marked: false })) } : g
      )
    );
  }

  function togglePin(id: string) {
    persist(grids.map((g) => (g.id === id ? { ...g, pinned: !g.pinned } : g)));
  }

  function toggleArchive(id: string) {
    persist(grids.map((g) => (g.id === id ? { ...g, archived: !g.archived } : g)));
  }

  // Calculés une fois pour servir à la fois d'aria-label et d'infobulle sur
  // leur bouton respectif, comme dans +1.
  // Signale une erreur de synchro dès l'en-tête (bouton menu) et sur le
  // bouton Synchroniser dans le menu déroulant : sans ça, rien ne
  // l'indiquait en dehors de la modale Synchroniser elle-même, qu'il faut
  // donc ouvrir "à l'aveugle" pour découvrir qu'un souci existe.
  const hasSyncError = remoteSync.status === "error";
  const menuButtonLabel = `${menuOpen ? "Masquer le menu" : "Ouvrir le menu"}${hasSyncError ? " (erreur de synchronisation)" : ""}`;
  const syncButtonLabel = `Synchroniser mes grilles${hasSyncError ? " (erreur de synchronisation)" : ""}`;
  const archiveViewLabel =
    archiveView === "archived"
      ? `Vue : Archivées (${archivedCount})`
      : archivedCount > 0
        ? `Vue : Actives (${archivedCount} archivée(s))`
        : "Vue : Actives";
  const ThemeIcon = THEME_ICON[themePreference];
  const ArchiveViewIcon = ARCHIVE_VIEW_ICON[archiveView];

  return (
    <>
      {focusMode && (
        <button
          className="focus-exit-btn"
          onClick={() => setFocusMode(false)}
          aria-label="Quitter le mode plein écran"
        >
          <CloseIcon />
        </button>
      )}

      {!focusMode && (
        <>
          <header className="topbar">
            <h1>Quine</h1>
            <div className="topbar-actions">
              <button className="btn btn-chrome" onClick={() => navigate("editor")}>
                + Nouvelle grille
              </button>
              <button
                className={`icon-btn${hasSyncError ? " icon-btn--alert" : ""}`}
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={menuOpen}
                aria-label={menuButtonLabel}
                title={menuButtonLabel}
              >
                <MoreIcon />
              </button>
            </div>

            {menuOpen && (
              <div className="topbar-menu" role="menu">
                {grids.length > 0 && (
                  <button
                    className="icon-btn"
                    onClick={() => {
                      setSearchOpen((v) => !v);
                      setMenuOpen(false);
                    }}
                    aria-label="Rechercher"
                    title="Rechercher"
                  >
                    <SearchIcon />
                  </button>
                )}
                <button
                  className="icon-btn"
                  onClick={() => {
                    onThemePreferenceChange(NEXT_THEME[themePreference]);
                    setMenuOpen(false);
                  }}
                  aria-label={`Thème : ${THEME_LABEL[themePreference]}`}
                  title={`Thème : ${THEME_LABEL[themePreference]}`}
                >
                  <ThemeIcon />
                </button>
                <button
                  className={`icon-btn${hasSyncError ? " icon-btn--alert" : ""}`}
                  onClick={() => {
                    setSyncOpen(true);
                    setMenuOpen(false);
                  }}
                  aria-label={syncButtonLabel}
                  title={syncButtonLabel}
                >
                  <SyncIcon />
                </button>
                {grids.length > 0 && (
                  <button
                    className="icon-btn"
                    onClick={() => {
                      setFocusMode(true);
                      setMenuOpen(false);
                    }}
                    aria-label="Mode plein écran"
                    title="Mode plein écran"
                  >
                    <FullscreenIcon />
                  </button>
                )}
                <button
                  className="icon-btn"
                  onClick={() => {
                    setArchiveView(NEXT_ARCHIVE_VIEW[archiveView]);
                    setMenuOpen(false);
                  }}
                  aria-label={archiveViewLabel}
                  title={archiveViewLabel}
                >
                  <ArchiveViewIcon />
                </button>
              </div>
            )}
          </header>

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
                <CloseIcon />
              </button>
            </div>
          )}
        </>
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
              onChange={updateGrid}
              onEdit={() => setEditTarget(grid)}
              onShare={() => setShareTarget(grid)}
              onCustomize={() => setCustomizeTarget(grid)}
            />
          ))}
        </Reorder.Group>
      )}

      {syncOpen && (
        <ErrorBoundary
          fallback={modalCrashFallback("Synchroniser mes grilles", CHUNK_LOAD_FAILED_MESSAGE, () => setSyncOpen(false))}
        >
          <Suspense fallback={null}>
            <ShareModal
              grids={grids}
              heading="Synchroniser mes grilles"
              hint="Scanne ce QR code depuis l'autre appareil, ou copie le lien."
              emptyHint="Ajoute au moins une grille pour générer un QR code."
              qrAlt="QR code de mes grilles"
              showJsonBackup
              onImport={handleImport}
              onClose={() => setSyncOpen(false)}
              remoteSync={remoteSync}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {shareTarget && (
        <ErrorBoundary
          fallback={modalCrashFallback(
            `Partager "${shareTarget.title}"`,
            CHUNK_LOAD_FAILED_MESSAGE,
            () => setShareTarget(null)
          )}
        >
          <Suspense fallback={null}>
            <ShareModal
              grids={[shareTarget]}
              heading={`Partager "${shareTarget.title}"`}
              hint="Scanne ce QR code, ou copie le lien pour que quelqu'un d'autre récupère cette grille."
              emptyHint="Impossible de générer un QR code."
              qrAlt={`QR code de la grille ${shareTarget.title}`}
              onClose={() => setShareTarget(null)}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {customizeTarget && (
        <ErrorBoundary
          fallback={modalCrashFallback(
            `Personnaliser « ${customizeTarget.title} »`,
            MODAL_CRASH_MESSAGE,
            () => setCustomizeTarget(null)
          )}
        >
          <CustomizeModal
            grid={customizeTarget}
            onClose={() => setCustomizeTarget(null)}
            onUpdate={(patch) => patchGrid(customizeTarget.id, patch)}
            onShuffle={() => shuffleGrid(customizeTarget.id)}
            onReset={() => resetGrid(customizeTarget.id)}
            onTogglePin={() => togglePin(customizeTarget.id)}
            onToggleArchive={() => toggleArchive(customizeTarget.id)}
            onDuplicate={() => handleDuplicate(customizeTarget)}
            onDelete={() => handleDelete(customizeTarget)}
          />
        </ErrorBoundary>
      )}

      {editTarget && (
        <ErrorBoundary
          fallback={modalCrashFallback(`Modifier « ${editTarget.title} »`, MODAL_CRASH_MESSAGE, () => setEditTarget(null))}
        >
          <EditModal grid={editTarget} onClose={() => setEditTarget(null)} onSave={updateGrid} />
        </ErrorBoundary>
      )}

      {syncNotice && (
        <div className="sync-toast" role="status">
          <span>{syncNotice}</span>
        </div>
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
