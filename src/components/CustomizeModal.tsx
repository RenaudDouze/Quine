import { useEffect, useState } from "react";
import { COLORS } from "../lib/colors";
import type { Grid } from "../lib/bingo";
import { isValidImageUrl } from "../lib/url";

interface Props {
  grid: Grid;
  onClose: () => void;
  onSetTitle: (title: string) => void;
  onSetColor: (color: string) => void;
  onSetBackgroundImage: (url: string | undefined) => void;
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
  onSetTitle,
  onSetColor,
  onSetBackgroundImage,
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

  function commitTitle() {
    const trimmed = draftTitle.trim() || "Grille de bingo";
    setDraftTitle(trimmed);
    onSetTitle(trimmed);
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
      onSetBackgroundImage(undefined);
    } else if (isValidImageUrl(trimmed)) {
      setBackgroundError(null);
      onSetBackgroundImage(trimmed);
    } else {
      setBackgroundError("URL http(s) invalide.");
    }
  }

  function clearBackground() {
    setDraftBackground("");
    setBackgroundError(null);
    onSetBackgroundImage(undefined);
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

  function handleDelete() {
    onDelete();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-panel-header">
          <h2>Personnaliser « {grid.title} »</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            ✕
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
                onClick={() => onSetColor(c)}
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
              aria-invalid={backgroundError !== null}
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
                ✕
              </button>
            )}
          </div>
          {backgroundError && <p className="modal-error">{backgroundError}</p>}
        </section>

        <section className="modal-section">
          <button className="modal-btn" onClick={handleShuffle}>
            🔀 Remélanger
          </button>
          <button className="modal-btn" onClick={handleReset}>
            ↺ Réinitialiser les coches
          </button>
          <button className="modal-btn" onClick={handleTogglePin}>
            {grid.pinned ? "📌 Détacher cette grille" : "📌 Épingler en haut"}
          </button>
          <button className="modal-btn" onClick={handleToggleArchive}>
            {grid.archived ? "📤 Désarchiver cette grille" : "📦 Archiver cette grille"}
          </button>
          <button className="modal-btn" onClick={handleDuplicate}>
            📋 Dupliquer cette grille
          </button>
        </section>

        <section className="modal-section modal-section--danger">
          <h3>Zone de danger</h3>
          <button type="button" className="modal-btn modal-btn--danger" onClick={handleDelete}>
            🗑 Supprimer cette grille
          </button>
        </section>
      </div>
    </div>
  );
}
