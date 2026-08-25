import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { Grid } from "../lib/bingo";
import { buildShareUrl, downloadBackup, parseBackupJson } from "../lib/share";

interface Props {
  grids: Grid[];
  heading: string;
  hint: string;
  emptyHint: string;
  qrAlt: string;
  showJsonBackup?: boolean;
  onImport?: (grids: Grid[], mode: "replace" | "merge") => void;
  onClose: () => void;
}

export default function ShareModal({
  grids,
  heading,
  hint,
  emptyHint,
  qrAlt,
  showJsonBackup,
  onImport,
  onClose,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronise avec la génération asynchrone du QR code (dépend de
  // `grids`) : ne peut pas être dérivé pendant le rendu.
  /* oxlint-disable react/set-state-in-effect -- see comment above */
  useEffect(() => {
    if (grids.length === 0) {
      setQrDataUrl(null);
      setShareUrl("");
      return;
    }
    const url = buildShareUrl(grids);
    setShareUrl(url);
    QRCode.toDataURL(url, { width: 240, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [grids]);
  /* oxlint-enable react/set-state-in-effect */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleFileChosen(file: File) {
    setError(null);
    const text = await file.text();
    const imported = parseBackupJson(text);
    if (!imported) {
      setError("Fichier illisible ou invalide.");
      return;
    }
    const mode =
      grids.length === 0 ||
      window.confirm(
        `Remplacer les ${grids.length} grille(s) actuelle(s) par les ${imported.length} importée(s) ?\n\nAnnuler pour les ajouter à la place.`
      )
        ? "replace"
        : "merge";
    onImport?.(imported, mode);
    onClose();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Impossible de copier automatiquement, sélectionne le lien manuellement.");
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-panel-header">
          <h2>{heading}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        <section className="modal-section">
          <p className="modal-hint">{hint}</p>
          {qrDataUrl ? (
            <img className="sync-qr" src={qrDataUrl} alt={qrAlt} width={200} height={200} />
          ) : (
            <p className="modal-hint">{emptyHint}</p>
          )}
          {shareUrl && (
            <button className="modal-btn" onClick={copyLink}>
              {copied ? "Lien copié ✓" : "Copier le lien"}
            </button>
          )}
        </section>

        {showJsonBackup && (
          <section className="modal-section">
            <h3>Fichier de sauvegarde</h3>
            <div className="modal-row">
              <button
                className="modal-btn"
                onClick={() => downloadBackup(grids)}
                disabled={grids.length === 0}
              >
                Exporter
              </button>
              <button className="modal-btn" onClick={() => fileInputRef.current?.click()}>
                Importer
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileChosen(file);
                  e.target.value = "";
                }}
              />
            </div>
          </section>
        )}

        {error && <p className="modal-error">{error}</p>}
      </div>
    </div>
  );
}
