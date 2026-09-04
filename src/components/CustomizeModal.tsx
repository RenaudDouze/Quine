import { useEffect, useId, useRef, useState } from "react";
import { COLORS } from "../lib/colors";
import type { Grid } from "../lib/bingo";
import { isValidImageUrl } from "../lib/url";
import { useFocusTrap } from "../hooks/useFocusTrap";
import {
  ArchiveIcon,
  CheckIcon,
  CloseIcon,
  DuplicateIcon,
  EyeIcon,
  PinIcon,
  ResetIcon,
  ShuffleIcon,
  TrashIcon,
} from "./icons";

// Fenêtre pendant laquelle un deuxième clic sur Supprimer confirme la
// suppression, avant que le bouton ne revienne à son état initial.
const CONFIRM_DELETE_TIMEOUT_MS = 2500;

interface Props {
  grid: Grid;
  onClose: () => void;
  onUpdate: (patch: Partial<Grid>) => void;
  onShuffle: () => void;
  onReset: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export default function CustomizeModal({
  grid,
  onClose,
  onUpdate,
  onShuffle,
  onReset,
  onTogglePin,
  onToggleArchive,
  onDuplicate,
  onDelete,
}: Props) {
  const [draftTitle, setDraftTitle] = useState(grid.title);
  const [draftBackground, setDraftBackground] = useState(grid.backgroundImageUrl ?? "");
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  const locked = !!grid.archived;
  const titleId = useId();
  const backgroundErrorId = useId();
  const panelRef = useFocusTrap<HTMLDivElement>();
  // Supprimer une grille est irréversible dans l'instant (voir le toast
  // d'annulation, plus tardif et plus discret) : un premier clic arme le
  // bouton plutôt que de supprimer directement, un second clic dans la
  // fenêtre ci-dessus confirme. Comme dans +1.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmDeleteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function commitTitle() {
    const trimmed = draftTitle.trim() || "Grille de Quine";
    setDraftTitle(trimmed);
    onUpdate({ title: trimmed });
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function commitBackground() {
    const trimmed = draftBackground.trim();
    if (!trimmed) {
      setBackgroundError(null);
      onUpdate({ backgroundImageUrl: undefined });
    } else if (isValidImageUrl(trimmed)) {
      setBackgroundError(null);
      onUpdate({ backgroundImageUrl: trimmed });
    } else {
      setBackgroundError("URL http(s) invalide.");
    }
  }

  function clearBackground() {
    setDraftBackground("");
    setBackgroundError(null);
    onUpdate({ backgroundImageUrl: undefined });
  }

  function handleShuffle() {
    if (!window.confirm("Remélanger la grille ? Les cases cochées seront effacées.")) return;
    onShuffle();
    onClose();
  }

  function handleReset() {
    if (!window.confirm("Réinitialiser les coches ? Toutes les cases seront décochées.")) return;
    onReset();
    onClose();
  }

  function handleTogglePin() {
    onTogglePin();
    onClose();
  }

  function handleToggleArchive() {
    onToggleArchive();
    onClose();
  }

  function handleDuplicate() {
    onDuplicate();
    onClose();
  }

  function handleDeleteClick() {
    if (confirmDelete) {
      clearTimeout(confirmDeleteTimer.current);
      onDelete();
      onClose();
      return;
    }
    setConfirmDelete(true);
    confirmDeleteTimer.current = setTimeout(() => setConfirmDelete(false), CONFIRM_DELETE_TIMEOUT_MS);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h2 id={titleId}>Personnaliser « {grid.title} »</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            <CloseIcon />
          </button>
        </div>

        {locked && (
          <p className="modal-hint modal-hint--locked">
            🔒 Grille archivée : désarchive-la pour changer sa couleur ou son image de fond.
          </p>
        )}

        <section className="modal-section">
          <h3>Nom</h3>
          <input
            type="text"
            className="modal-input"
            disabled={locked}
            value={draftTitle}
            maxLength={60}
            aria-label="Nom de la grille"
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
            }}
          />
        </section>

        <section className="modal-section">
          <h3>Couleur</h3>
          <div className="settings-color-grid">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={locked}
                className={`color-option${c === grid.color ? " selected" : ""}`}
                style={{ background: c }}
                aria-label={`Choisir la couleur ${c}`}
                onClick={() => onUpdate({ color: c })}
              />
            ))}
          </div>
        </section>

        <section className="modal-section">
          <h3>Image de fond</h3>
          <div className="modal-row">
            <input
              type="url"
              inputMode="url"
              className="modal-input"
              disabled={locked}
              aria-label="URL de l'image de fond"
              aria-invalid={backgroundError !== null}
              aria-describedby={backgroundError ? backgroundErrorId : undefined}
              value={draftBackground}
              placeholder="https://exemple.com/image.jpg"
              onChange={(e) => {
                setDraftBackground(e.target.value);
                setBackgroundError(null);
              }}
              onBlur={commitBackground}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitBackground();
              }}
            />
            {draftBackground !== "" && (
              <button
                className="modal-close"
                disabled={locked}
                onClick={clearBackground}
                aria-label="Vider l'image de fond"
              >
                <CloseIcon />
              </button>
            )}
          </div>
          {backgroundError && (
            <p id={backgroundErrorId} className="modal-error">
              {backgroundError}
            </p>
          )}
        </section>

        <section className="modal-section">
          <button className="modal-btn" onClick={handleShuffle}>
            <ShuffleIcon width={16} height={16} /> Remélanger
          </button>
          <button className="modal-btn" onClick={handleReset}>
            <ResetIcon width={16} height={16} /> Réinitialiser les coches
          </button>
          <button className="modal-btn" onClick={handleTogglePin}>
            <PinIcon width={16} height={16} /> {grid.pinned ? "Détacher cette grille" : "Épingler en haut"}
          </button>
          <button className="modal-btn" onClick={handleToggleArchive}>
            {grid.archived ? (
              <>
                <EyeIcon width={16} height={16} /> Désarchiver cette grille
              </>
            ) : (
              <>
                <ArchiveIcon width={16} height={16} /> Archiver cette grille
              </>
            )}
          </button>
          <button className="modal-btn" onClick={handleDuplicate}>
            <DuplicateIcon width={16} height={16} /> Dupliquer cette grille
          </button>
        </section>

        <section className="modal-section modal-section--danger">
          <h3>Zone de danger</h3>
          <button
            type="button"
            className="modal-btn modal-btn--danger"
            onClick={handleDeleteClick}
            aria-live="polite"
            aria-atomic="true"
          >
            {confirmDelete ? (
              <>
                <CheckIcon width={16} height={16} /> Confirmer la suppression
              </>
            ) : (
              <>
                <TrashIcon width={16} height={16} /> Supprimer cette grille
              </>
            )}
          </button>
        </section>
      </div>
    </div>
  );
}
