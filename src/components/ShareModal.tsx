import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { Grid } from "../lib/bingo";
import { downloadGridSvg } from "../lib/gridImage";
import { printGrid } from "../lib/print";
import { formatSyncCode } from "../lib/remoteSync";
import { buildShareUrl, downloadBackup, parseBackupJson } from "../lib/share";
import type { UseRemoteSyncResult } from "../hooks/useRemoteSync";

interface Props {
  grids: Grid[];
  heading: string;
  hint: string;
  emptyHint: string;
  qrAlt: string;
  showJsonBackup?: boolean;
  onImport?: (grids: Grid[], mode: "replace" | "merge") => void;
  onClose: () => void;
  /** Présent uniquement pour la modale « synchroniser toutes mes grilles » :
   * absent quand on partage une seule grille (la synchro par code porte sur
   * la liste entière, pas sur une grille isolée). */
  remoteSync?: UseRemoteSyncResult;
}

const REMOTE_STATUS_LABEL: Record<UseRemoteSyncResult["status"], string> = {
  disabled: "",
  syncing: "Synchronisation…",
  synced: "Synchronisé ✓",
  error: "Erreur de synchronisation",
};

const JOIN_OUTCOME_ERROR: Record<"invalid" | "not-found" | "error", string> = {
  invalid: "Code invalide (8 caractères attendus).",
  "not-found": "Ce code de synchronisation est introuvable.",
  error: "Impossible de rejoindre ce code, réessaie.",
};

export default function ShareModal({
  grids,
  heading,
  hint,
  emptyHint,
  qrAlt,
  showJsonBackup,
  onImport,
  onClose,
  remoteSync,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinInput, setJoinInput] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

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

  // N'est appelée que depuis les boutons/raccourcis du bloc "Code de
  // synchro" ci-dessous, qui n'existe dans le DOM que si `remoteSync` est
  // fourni : la non-nullité est garantie par le rendu conditionnel, pas
  // besoin de la revérifier ici.
  async function handleJoinCode() {
    setJoinError(null);
    const outcome = await remoteSync!.joinCode(joinInput);
    if (outcome === "joined") {
      setJoinOpen(false);
      setJoinInput("");
      return;
    }
    setJoinError(JOIN_OUTCOME_ERROR[outcome]);
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

        {remoteSync && import.meta.env.VITE_SYNC_WORKER_URL && (
          <section className="modal-section">
            <h3>Code de synchro</h3>
            {remoteSync.code ? (
              <>
                <p className="sync-code">{formatSyncCode(remoteSync.code)}</p>
                <p className={`sync-status sync-status--${remoteSync.status}`}>
                  {remoteSync.status === "error" && remoteSync.errorMessage
                    ? remoteSync.errorMessage
                    : REMOTE_STATUS_LABEL[remoteSync.status]}
                </p>
                <button className="modal-btn" onClick={remoteSync.disable}>
                  Se déconnecter
                </button>
              </>
            ) : joinOpen ? (
              <div className="modal-row">
                <input
                  autoFocus
                  className="modal-input"
                  placeholder="XXXX XXXX"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleJoinCode();
                    if (e.key === "Escape") setJoinOpen(false);
                  }}
                />
                <button className="modal-btn" onClick={handleJoinCode} disabled={joinInput.trim() === ""}>
                  Rejoindre
                </button>
              </div>
            ) : (
              <>
                <p className="modal-hint">
                  Synchronise automatiquement tes grilles avec un autre appareil, sans compte : génère un code sur le
                  premier, saisis-le sur le second.
                </p>
                <div className="modal-row">
                  <button className="modal-btn" onClick={() => remoteSync.createCode()}>
                    Nouveau code
                  </button>
                  <button className="modal-btn" onClick={() => setJoinOpen(true)}>
                    Saisir un code
                  </button>
                </div>
              </>
            )}
            {joinError && <p className="modal-error">{joinError}</p>}
          </section>
        )}

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

        {grids.length === 1 && (
          <section className="modal-section">
            <div className="modal-row">
              <button className="modal-btn" onClick={() => downloadGridSvg(grids[0])}>
                🖼️ Exporter en image
              </button>
              <button className="modal-btn" onClick={() => printGrid(grids[0].id)}>
                🖨️ Imprimer
              </button>
            </div>
          </section>
        )}

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
