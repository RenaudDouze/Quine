import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import QRCode from "qrcode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCells, type Grid } from "../lib/bingo";
import { downloadGridSvg } from "../lib/gridImage";
import { printGrid } from "../lib/print";
import type { UseRemoteSyncResult } from "../hooks/useRemoteSync";
import ShareModal from "./ShareModal";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(),
  },
}));

vi.mock("../lib/gridImage", () => ({
  downloadGridSvg: vi.fn(),
}));

vi.mock("../lib/print", () => ({
  printGrid: vi.fn(),
}));

function makeGrid(overrides: Partial<Grid> = {}): Grid {
  const size = overrides.size ?? 3;
  const freeCenter = overrides.freeCenter ?? false;
  const items = overrides.items ?? ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  return {
    id: "id-1",
    title: "Grille 1",
    size,
    freeCenter,
    items,
    cells: buildCells(items, size, freeCenter),
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

const defaultProps = {
  heading: "Titre",
  hint: "Indice",
  emptyHint: "Rien à partager",
  qrAlt: "QR code",
};

function makeRemoteSync(overrides: Partial<UseRemoteSyncResult> = {}): UseRemoteSyncResult {
  return {
    code: null,
    status: "disabled",
    errorMessage: null,
    createCode: vi.fn(),
    joinCode: vi.fn(),
    disable: vi.fn(),
    ...overrides,
  };
}

describe("ShareModal", () => {
  const toDataURLMock = QRCode.toDataURL as unknown as ReturnType<
    typeof vi.fn<(text: string, opts?: unknown) => Promise<string>>
  >;

  beforeEach(() => {
    toDataURLMock.mockReset();
    toDataURLMock.mockResolvedValue("data:image/png;base64,fake");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("affiche le titre et l'indice fournis", () => {
    render(<ShareModal {...defaultProps} grids={[]} onClose={vi.fn()} />);
    expect(screen.getByText("Titre")).toBeInTheDocument();
    expect(screen.getByText("Indice")).toBeInTheDocument();
  });

  describe("accessibilité", () => {
    it("expose une boîte de dialogue modale, nommée par son titre", () => {
      render(<ShareModal {...defaultProps} grids={[]} onClose={vi.fn()} />);
      const dialog = screen.getByRole("dialog", { name: "Titre" });
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("déplace le focus dans la modale au montage", () => {
      render(<ShareModal {...defaultProps} grids={[]} onClose={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Fermer" })).toHaveFocus();
    });

    it("restaure le focus sur l'élément déclencheur à la fermeture", () => {
      const trigger = document.createElement("button");
      trigger.textContent = "Partager";
      document.body.appendChild(trigger);
      trigger.focus();

      const { unmount } = render(<ShareModal {...defaultProps} grids={[]} onClose={vi.fn()} />);
      expect(trigger).not.toHaveFocus();

      unmount();
      expect(trigger).toHaveFocus();
      trigger.remove();
    });
  });

  it("affiche l'indice vide quand il n'y a rien à partager", () => {
    render(<ShareModal {...defaultProps} grids={[]} onClose={vi.fn()} />);
    expect(screen.getByText("Rien à partager")).toBeInTheDocument();
    expect(toDataURLMock).not.toHaveBeenCalled();
  });

  it("n'affiche pas le bouton copier le lien sans grille", () => {
    render(<ShareModal {...defaultProps} grids={[]} onClose={vi.fn()} />);
    expect(screen.queryByText("Copier le lien")).not.toBeInTheDocument();
  });

  it("génère et affiche le QR code quand il y a des grilles", async () => {
    render(<ShareModal {...defaultProps} grids={[makeGrid()]} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByAltText("QR code")).toBeInTheDocument();
    });
    const img = screen.getByAltText("QR code") as HTMLImageElement;
    expect(img.src).toBe("data:image/png;base64,fake");
  });

  it("affiche le message de repli si la génération du QR code échoue", async () => {
    toDataURLMock.mockRejectedValue(new Error("échec canvas"));
    render(<ShareModal {...defaultProps} grids={[makeGrid()]} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Rien à partager")).toBeInTheDocument();
    });
  });

  it("affiche le bouton copier le lien quand il y a des grilles", async () => {
    render(<ShareModal {...defaultProps} grids={[makeGrid()]} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Copier le lien")).toBeInTheDocument());
  });

  it("ferme le panneau avec la touche Échap", () => {
    const onClose = vi.fn();
    render(<ShareModal {...defaultProps} grids={[]} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignore les autres touches que Échap", () => {
    const onClose = vi.fn();
    render(<ShareModal {...defaultProps} grids={[]} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("se désabonne des touches au démontage", () => {
    const onClose = vi.fn();
    const { unmount } = render(<ShareModal {...defaultProps} grids={[]} onClose={onClose} />);
    unmount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ferme le panneau au clic sur l'arrière-plan", () => {
    const onClose = vi.fn();
    const { container } = render(<ShareModal {...defaultProps} grids={[]} onClose={onClose} />);
    fireEvent.click(container.querySelector(".modal-overlay")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ne ferme pas le panneau au clic à l'intérieur", () => {
    const onClose = vi.fn();
    const { container } = render(<ShareModal {...defaultProps} grids={[]} onClose={onClose} />);
    fireEvent.click(container.querySelector(".modal-panel")!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ferme le panneau au clic sur la croix", () => {
    const onClose = vi.fn();
    render(<ShareModal {...defaultProps} grids={[]} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ne montre pas la section JSON par défaut", () => {
    render(<ShareModal {...defaultProps} grids={[]} onClose={vi.fn()} />);
    expect(screen.queryByText("Fichier de sauvegarde")).not.toBeInTheDocument();
  });

  describe("export JSON", () => {
    it("désactive le bouton exporter sans grille", () => {
      render(<ShareModal {...defaultProps} grids={[]} showJsonBackup onClose={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Exporter" })).toBeDisabled();
    });

    it("exporte les grilles au clic", () => {
      const grids = [makeGrid()];
      render(<ShareModal {...defaultProps} grids={grids} showJsonBackup onClose={vi.fn()} />);
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
      const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      fireEvent.click(screen.getByRole("button", { name: "Exporter" }));
      expect(clickSpy).toHaveBeenCalledTimes(1);
      clickSpy.mockRestore();
      createObjectURLSpy.mockRestore();
      revokeObjectURLSpy.mockRestore();
    });
  });

  describe("import JSON", () => {
    it("ouvre le sélecteur de fichier au clic sur Importer", () => {
      render(<ShareModal {...defaultProps} grids={[]} showJsonBackup onClose={vi.fn()} />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const clickSpy = vi.spyOn(input, "click").mockImplementation(() => {});
      fireEvent.click(screen.getByRole("button", { name: "Importer" }));
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it("ne fait rien si aucun fichier n'est sélectionné", async () => {
      const onImport = vi.fn();
      render(<ShareModal {...defaultProps} grids={[]} showJsonBackup onImport={onImport} onClose={vi.fn()} />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { files: [] } });
      });
      expect(onImport).not.toHaveBeenCalled();
    });

    it("remplace directement quand il n'y a aucune grille existante (sans confirmation)", async () => {
      const onImport = vi.fn();
      const onClose = vi.fn();
      const confirmSpy = vi.spyOn(window, "confirm");
      render(<ShareModal {...defaultProps} grids={[]} showJsonBackup onImport={onImport} onClose={onClose} />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(
        [JSON.stringify([{ title: "Importé", size: 3, items: ["A"] }])],
        "backup.json",
        { type: "application/json" }
      );
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
      });
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(onImport).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ title: "Importé" })]),
        "replace"
      );
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("remplace après confirmation quand des grilles existent déjà", async () => {
      const onImport = vi.fn();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      render(
        <ShareModal {...defaultProps} grids={[makeGrid()]} showJsonBackup onImport={onImport} onClose={vi.fn()} />
      );
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(
        [JSON.stringify([{ title: "Importé", size: 3, items: ["A"] }])],
        "backup.json",
        { type: "application/json" }
      );
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
      });
      expect(onImport).toHaveBeenCalledWith(expect.any(Array), "replace");
    });

    it("fusionne quand la confirmation est refusée", async () => {
      const onImport = vi.fn();
      vi.spyOn(window, "confirm").mockReturnValue(false);
      render(
        <ShareModal {...defaultProps} grids={[makeGrid()]} showJsonBackup onImport={onImport} onClose={vi.fn()} />
      );
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(
        [JSON.stringify([{ title: "Importé", size: 3, items: ["A"] }])],
        "backup.json",
        { type: "application/json" }
      );
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
      });
      expect(onImport).toHaveBeenCalledWith(expect.any(Array), "merge");
    });

    it("affiche une erreur pour un fichier invalide", async () => {
      const onImport = vi.fn();
      const onClose = vi.fn();
      render(<ShareModal {...defaultProps} grids={[]} showJsonBackup onImport={onImport} onClose={onClose} />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(["{invalide"], "backup.json", { type: "application/json" });
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
      });
      expect(screen.getByText("Fichier illisible ou invalide.")).toBeInTheDocument();
      expect(onImport).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("réinitialise la valeur de l'input après sélection", async () => {
      render(<ShareModal {...defaultProps} grids={[]} showJsonBackup onClose={vi.fn()} />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(
        [JSON.stringify([{ title: "A", size: 3, items: ["A"] }])],
        "backup.json",
        { type: "application/json" }
      );
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
      });
      expect(input.value).toBe("");
    });
  });

  describe("export image et impression", () => {
    it("n'affiche pas les boutons export/impression pour plusieurs grilles", () => {
      render(<ShareModal {...defaultProps} grids={[makeGrid({ id: "a" }), makeGrid({ id: "b" })]} onClose={vi.fn()} />);
      expect(screen.queryByText(/Exporter en image/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Imprimer/)).not.toBeInTheDocument();
    });

    it("exporte la grille en image au clic", async () => {
      const grid = makeGrid();
      render(<ShareModal {...defaultProps} grids={[grid]} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/Exporter en image/)).toBeInTheDocument());
      fireEvent.click(screen.getByText(/Exporter en image/));
      expect(downloadGridSvg).toHaveBeenCalledWith(grid);
    });

    it("imprime la grille au clic", async () => {
      const grid = makeGrid();
      render(<ShareModal {...defaultProps} grids={[grid]} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/Imprimer/)).toBeInTheDocument());
      fireEvent.click(screen.getByText(/Imprimer/));
      expect(printGrid).toHaveBeenCalledWith(grid.id);
    });
  });

  describe("copie du lien", () => {
    it("copie le lien de partage dans le presse-papiers", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: writeTextMock } });
      render(<ShareModal {...defaultProps} grids={[makeGrid()]} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText("Copier le lien")).toBeInTheDocument());
      await act(async () => {
        fireEvent.click(screen.getByText("Copier le lien"));
      });
      expect(writeTextMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Lien copié")).toBeInTheDocument();
      vi.unstubAllGlobals();
    });

    it("revient au libellé initial après le délai", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: writeTextMock } });
      render(<ShareModal {...defaultProps} grids={[makeGrid()]} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText("Copier le lien")).toBeInTheDocument());
      await act(async () => {
        fireEvent.click(screen.getByText("Copier le lien"));
      });
      expect(screen.getByText("Lien copié")).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      expect(screen.getByText("Copier le lien")).toBeInTheDocument();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    it("affiche une erreur si la copie échoue", async () => {
      const writeTextMock = vi.fn().mockRejectedValue(new Error("refusé"));
      vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: writeTextMock } });
      render(<ShareModal {...defaultProps} grids={[makeGrid()]} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText("Copier le lien")).toBeInTheDocument());
      await act(async () => {
        fireEvent.click(screen.getByText("Copier le lien"));
      });
      expect(
        screen.getByText("Impossible de copier automatiquement, sélectionne le lien manuellement.")
      ).toBeInTheDocument();
      vi.unstubAllGlobals();
    });
  });

  describe("code de synchro", () => {
    it("n'affiche pas la section sans prop remoteSync", () => {
      render(<ShareModal {...defaultProps} grids={[]} onClose={vi.fn()} />);
      expect(screen.queryByText("Code de synchro")).not.toBeInTheDocument();
    });

    it("n'affiche pas la section sans worker de synchro configuré, même avec remoteSync", () => {
      render(<ShareModal {...defaultProps} grids={[]} remoteSync={makeRemoteSync()} onClose={vi.fn()} />);
      expect(screen.queryByText("Code de synchro")).not.toBeInTheDocument();
    });

    describe("avec un worker configuré (VITE_SYNC_WORKER_URL)", () => {
      beforeEach(() => {
        vi.stubEnv("VITE_SYNC_WORKER_URL", "https://sync.example.workers.dev");
      });

      afterEach(() => {
        vi.unstubAllEnvs();
      });

      it("n'affiche pas la section sans prop remoteSync", () => {
        render(<ShareModal {...defaultProps} grids={[]} onClose={vi.fn()} />);
        expect(screen.queryByText("Code de synchro")).not.toBeInTheDocument();
      });

      it("propose de créer ou rejoindre un code quand inactif", () => {
        render(<ShareModal {...defaultProps} grids={[]} remoteSync={makeRemoteSync()} onClose={vi.fn()} />);
        expect(screen.getByText("Code de synchro")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Nouveau code" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Saisir un code" })).toBeInTheDocument();
      });

      it("déclenche createCode au clic sur Nouveau code", () => {
        const remoteSync = makeRemoteSync();
        render(<ShareModal {...defaultProps} grids={[]} remoteSync={remoteSync} onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Nouveau code" }));
        expect(remoteSync.createCode).toHaveBeenCalledTimes(1);
      });

      it("révèle le champ de saisie au clic sur Saisir un code", () => {
        render(<ShareModal {...defaultProps} grids={[]} remoteSync={makeRemoteSync()} onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Saisir un code" }));
        expect(screen.getByPlaceholderText("XXXX XXXX")).toBeInTheDocument();
      });

      it("désactive Rejoindre tant que le champ est vide", () => {
        render(<ShareModal {...defaultProps} grids={[]} remoteSync={makeRemoteSync()} onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Saisir un code" }));
        expect(screen.getByRole("button", { name: "Rejoindre" })).toBeDisabled();
      });

      it("rejoint un code au clic sur Rejoindre", async () => {
        const remoteSync = makeRemoteSync({ joinCode: vi.fn().mockResolvedValue("joined") });
        render(<ShareModal {...defaultProps} grids={[]} remoteSync={remoteSync} onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Saisir un code" }));
        fireEvent.change(screen.getByPlaceholderText("XXXX XXXX"), { target: { value: "abcdefgh" } });
        await act(async () => {
          fireEvent.click(screen.getByRole("button", { name: "Rejoindre" }));
        });
        expect(remoteSync.joinCode).toHaveBeenCalledWith("abcdefgh");
        expect(screen.queryByPlaceholderText("XXXX XXXX")).not.toBeInTheDocument();
      });

      it("rejoint un code avec la touche Entrée", async () => {
        const remoteSync = makeRemoteSync({ joinCode: vi.fn().mockResolvedValue("joined") });
        render(<ShareModal {...defaultProps} grids={[]} remoteSync={remoteSync} onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Saisir un code" }));
        const input = screen.getByPlaceholderText("XXXX XXXX");
        fireEvent.change(input, { target: { value: "abcdefgh" } });
        await act(async () => {
          fireEvent.keyDown(input, { key: "Enter" });
        });
        expect(remoteSync.joinCode).toHaveBeenCalledWith("abcdefgh");
      });

      it("ferme le champ de saisie avec Échap", () => {
        render(<ShareModal {...defaultProps} grids={[]} remoteSync={makeRemoteSync()} onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Saisir un code" }));
        const input = screen.getByPlaceholderText("XXXX XXXX");
        fireEvent.keyDown(input, { key: "Escape" });
        expect(screen.queryByPlaceholderText("XXXX XXXX")).not.toBeInTheDocument();
      });

      it.each([
        ["invalid", "Code invalide (8 caractères attendus)."],
        ["not-found", "Ce code de synchronisation est introuvable."],
        ["error", "Impossible de rejoindre ce code, réessaie."],
      ] as const)("affiche l'erreur correspondante pour l'issue %s", async (outcome, message) => {
        const remoteSync = makeRemoteSync({ joinCode: vi.fn().mockResolvedValue(outcome) });
        render(<ShareModal {...defaultProps} grids={[]} remoteSync={remoteSync} onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Saisir un code" }));
        fireEvent.change(screen.getByPlaceholderText("XXXX XXXX"), { target: { value: "abcdefgh" } });
        await act(async () => {
          fireEvent.click(screen.getByRole("button", { name: "Rejoindre" }));
        });
        expect(screen.getByText(message)).toBeInTheDocument();
      });

      it("préfère le message d'erreur précis du hook au message générique quand il est disponible", async () => {
        const joinCode = vi.fn().mockResolvedValue("error");
        const remoteSync = makeRemoteSync({ joinCode, errorMessage: "Failed to fetch" });
        render(<ShareModal {...defaultProps} grids={[]} remoteSync={remoteSync} onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Saisir un code" }));
        fireEvent.change(screen.getByPlaceholderText("XXXX XXXX"), { target: { value: "abcdefgh" } });
        await act(async () => {
          fireEvent.click(screen.getByRole("button", { name: "Rejoindre" }));
        });
        expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
        expect(screen.queryByText("Impossible de rejoindre ce code, réessaie.")).not.toBeInTheDocument();
      });

      it("affiche l'échec de « Nouveau code » alors qu'aucun code n'est encore actif", () => {
        const remoteSync = makeRemoteSync({
          status: "error",
          errorMessage: "Impossible de créer un code de synchronisation.",
        });
        render(<ShareModal {...defaultProps} grids={[]} remoteSync={remoteSync} onClose={vi.fn()} />);
        expect(screen.getByText("Impossible de créer un code de synchronisation.")).toBeInTheDocument();
        // Toujours proposé pour réessayer.
        expect(screen.getByRole("button", { name: "Nouveau code" })).toBeInTheDocument();
      });

      it("retombe sur le message générique si « Nouveau code » échoue sans détail", () => {
        const remoteSync = makeRemoteSync({ status: "error", errorMessage: null });
        render(<ShareModal {...defaultProps} grids={[]} remoteSync={remoteSync} onClose={vi.fn()} />);
        expect(screen.getByText("Erreur de synchronisation")).toBeInTheDocument();
      });

      it("affiche le code actif formaté et le bouton de déconnexion", () => {
        const remoteSync = makeRemoteSync({ code: "ABCDEFGH", status: "syncing" });
        render(<ShareModal {...defaultProps} grids={[]} remoteSync={remoteSync} onClose={vi.fn()} />);
        expect(screen.getByText("ABCD EFGH")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Se déconnecter" })).toBeInTheDocument();
      });

      it("appelle disable au clic sur Se déconnecter", () => {
        const remoteSync = makeRemoteSync({ code: "ABCDEFGH", status: "synced" });
        render(<ShareModal {...defaultProps} grids={[]} remoteSync={remoteSync} onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
        expect(remoteSync.disable).toHaveBeenCalledTimes(1);
      });

      it("affiche « Synchronisé ✓ » quand le statut est synced", () => {
        const remoteSync = makeRemoteSync({ code: "ABCDEFGH", status: "synced" });
        render(<ShareModal {...defaultProps} grids={[]} remoteSync={remoteSync} onClose={vi.fn()} />);
        expect(screen.getByText("Synchronisé ✓")).toBeInTheDocument();
      });

      it("affiche le message d'erreur précis en cas d'erreur", () => {
        const remoteSync = makeRemoteSync({
          code: "ABCDEFGH",
          status: "error",
          errorMessage: "Ce code de synchronisation n'existe plus.",
        });
        render(<ShareModal {...defaultProps} grids={[]} remoteSync={remoteSync} onClose={vi.fn()} />);
        expect(screen.getByText("Ce code de synchronisation n'existe plus.")).toBeInTheDocument();
      });

      it("affiche un message d'erreur générique si aucun message précis n'est fourni", () => {
        const remoteSync = makeRemoteSync({ code: "ABCDEFGH", status: "error", errorMessage: null });
        render(<ShareModal {...defaultProps} grids={[]} remoteSync={remoteSync} onClose={vi.fn()} />);
        expect(screen.getByText("Erreur de synchronisation")).toBeInTheDocument();
      });
    });
  });
});
