import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import QRCode from "qrcode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCells, type Grid } from "../lib/bingo";
import { downloadGridSvg } from "../lib/gridImage";
import { exportGridsAsPdf } from "../lib/pdfExport";
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

vi.mock("../lib/pdfExport", () => ({
  exportGridsAsPdf: vi.fn(),
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

  it("warns that the data is neither encrypted nor protected", () => {
    render(<ShareModal {...defaultProps} grids={[]} onClose={vi.fn()} />);
    expect(screen.getByText(/ni chiffrées ni protégées/i)).toBeInTheDocument();
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

  describe("export PDF de plusieurs cartes", () => {
    it("n'affiche pas le bouton pour plusieurs grilles", () => {
      render(<ShareModal {...defaultProps} grids={[makeGrid({ id: "a" }), makeGrid({ id: "b" })]} onClose={vi.fn()} />);
      expect(screen.queryByText(/Plusieurs cartes \(PDF\)/)).not.toBeInTheDocument();
    });

    it("révèle le réglage du nombre de cartes au clic, avec 10 par défaut", async () => {
      render(<ShareModal {...defaultProps} grids={[makeGrid()]} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/Plusieurs cartes \(PDF\)/)).toBeInTheDocument());
      fireEvent.click(screen.getByText(/Plusieurs cartes \(PDF\)/));
      expect(screen.queryByText(/Plusieurs cartes \(PDF\)/)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Nombre de cartes/)).toHaveValue(10);
      expect(screen.getByRole("button", { name: "Générer le PDF" })).toBeInTheDocument();
    });

    it("génère autant de variantes que demandé, avec le titre de la grille comme nom de fichier", async () => {
      const grid = makeGrid({ title: "Soirée jeux" });
      vi.mocked(exportGridsAsPdf).mockResolvedValue(undefined);
      render(<ShareModal {...defaultProps} grids={[grid]} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/Plusieurs cartes \(PDF\)/)).toBeInTheDocument());
      fireEvent.click(screen.getByText(/Plusieurs cartes \(PDF\)/));
      fireEvent.change(screen.getByLabelText(/Nombre de cartes/), { target: { value: "4" } });
      fireEvent.click(screen.getByRole("button", { name: "Générer le PDF" }));

      await waitFor(() => expect(exportGridsAsPdf).toHaveBeenCalledTimes(1));
      const [variants, filename] = vi.mocked(exportGridsAsPdf).mock.calls[0];
      expect(variants).toHaveLength(4);
      expect(variants.every((v) => v.title === "Soirée jeux" && v.size === grid.size)).toBe(true);
      expect(filename).toBe("Soirée jeux");
    });

    it("désactive le bouton et affiche un état de progression pendant la génération", async () => {
      let resolveExport: () => void = () => {};
      vi.mocked(exportGridsAsPdf).mockReturnValue(
        new Promise((resolve) => {
          resolveExport = () => resolve(undefined);
        })
      );
      render(<ShareModal {...defaultProps} grids={[makeGrid()]} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/Plusieurs cartes \(PDF\)/)).toBeInTheDocument());
      fireEvent.click(screen.getByText(/Plusieurs cartes \(PDF\)/));
      fireEvent.click(screen.getByRole("button", { name: "Générer le PDF" }));

      const button = await screen.findByRole("button", { name: "Génération…" });
      expect(button).toBeDisabled();

      await act(async () => {
        resolveExport();
      });
      expect(screen.getByRole("button", { name: "Générer le PDF" })).not.toBeDisabled();
    });

    it("désactive le bouton en dehors des bornes autorisées (2 à 100)", async () => {
      render(<ShareModal {...defaultProps} grids={[makeGrid()]} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/Plusieurs cartes \(PDF\)/)).toBeInTheDocument());
      fireEvent.click(screen.getByText(/Plusieurs cartes \(PDF\)/));
      const input = screen.getByLabelText(/Nombre de cartes/);
      const button = screen.getByRole("button", { name: "Générer le PDF" });

      fireEvent.change(input, { target: { value: "1" } });
      expect(button).toBeDisabled();

      fireEvent.change(input, { target: { value: "101" } });
      expect(button).toBeDisabled();

      fireEvent.change(input, { target: { value: "50" } });
      expect(button).not.toBeDisabled();
    });

    it("affiche un message d'erreur si la génération échoue, sans planter", async () => {
      vi.mocked(exportGridsAsPdf).mockRejectedValue(new Error("chunk introuvable"));
      render(<ShareModal {...defaultProps} grids={[makeGrid()]} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText(/Plusieurs cartes \(PDF\)/)).toBeInTheDocument());
      fireEvent.click(screen.getByText(/Plusieurs cartes \(PDF\)/));
      fireEvent.click(screen.getByRole("button", { name: "Générer le PDF" }));
      expect(await screen.findByText(/Impossible de générer le PDF/)).toBeInTheDocument();
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

describe("ShareModal — détails", () => {
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
    vi.unstubAllEnvs();
  });

  const renderModal = (props: Partial<React.ComponentProps<typeof ShareModal>> = {}) =>
    render(<ShareModal {...defaultProps} grids={[]} onClose={vi.fn()} {...props} />);
  const rerenderModal = (r: ReturnType<typeof render>, props: Partial<React.ComponentProps<typeof ShareModal>> = {}) =>
    r.rerender(<ShareModal {...defaultProps} grids={[]} onClose={vi.fn()} {...props} />);

  it("génère le QR code avec les réglages attendus", async () => {
    renderModal({ grids: [makeGrid()] });
    await waitFor(() => expect(toDataURLMock).toHaveBeenCalled());
    expect(toDataURLMock).toHaveBeenCalledWith(expect.stringContaining("http"), {
      width: 240,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    });
  });

  it("régénère le QR code et le lien quand les grilles changent", async () => {
    const r = renderModal({ grids: [makeGrid()] });
    await screen.findByAltText("QR code");
    toDataURLMock.mockResolvedValue("data:image/png;base64,second");
    rerenderModal(r, { grids: [makeGrid({ title: "Autre" })] });
    await waitFor(() =>
      expect((screen.getByAltText("QR code") as HTMLImageElement).src).toBe("data:image/png;base64,second"),
    );
    expect(toDataURLMock).toHaveBeenCalledTimes(2);
  });

  it("retire le QR code et le bouton de copie quand il n'y a plus de grille", async () => {
    const r = renderModal({ grids: [makeGrid()] });
    await screen.findByAltText("QR code");
    rerenderModal(r, { grids: [] });
    expect(screen.queryByAltText("QR code")).not.toBeInTheDocument();
    expect(screen.queryByText("Copier le lien")).not.toBeInTheDocument();
    expect(screen.getByText("Rien à partager")).toBeInTheDocument();
  });

  it("retire un QR code précédent quand la génération suivante échoue", async () => {
    const r = renderModal({ grids: [makeGrid()] });
    await screen.findByAltText("QR code");
    toDataURLMock.mockRejectedValue(new Error("trop gros"));
    rerenderModal(r, { grids: [makeGrid({ title: "Autre" })] });
    await waitFor(() => expect(screen.queryByAltText("QR code")).not.toBeInTheDocument());
  });

  it("Échap appelle le dernier onClose reçu", () => {
    const first = vi.fn();
    const second = vi.fn();
    const r = renderModal({ onClose: first });
    r.rerender(<ShareModal {...defaultProps} grids={[]} onClose={second} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("porte tabindex -1 sur la boîte de dialogue et aucun message d'erreur au départ", () => {
    renderModal();
    expect(screen.getByRole("dialog")).toHaveAttribute("tabindex", "-1");
    expect(document.querySelector(".modal-error")).not.toBeInTheDocument();
  });

  it("demande confirmation avec le nombre de grilles actuelles et importées", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderModal({ grids: [makeGrid()], showJsonBackup: true, onImport: vi.fn() });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([JSON.stringify([makeGrid({ id: "x" }), makeGrid({ id: "y" })])], "b.json", { type: "application/json" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect(confirm).toHaveBeenCalledWith(
      "Remplacer les 1 grille(s) actuelle(s) par les 2 importée(s) ?\n\nAnnuler pour les ajouter à la place.",
    );
  });

  it("ignore un changement d'input sans liste de fichiers", async () => {
    const onImport = vi.fn();
    renderModal({ showJsonBackup: true, onImport });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: null } });
    });
    expect(onImport).not.toHaveBeenCalled();
  });

  it("accepte exactement 2 et 100 cartes, refuse 1 et 101", async () => {
    renderModal({ grids: [makeGrid()] });
    fireEvent.click(await screen.findByText(/Plusieurs cartes \(PDF\)/));
    const input = screen.getByLabelText(/Nombre de cartes/);
    const button = screen.getByRole("button", { name: "Générer le PDF" });
    for (const [value, disabled] of [["1", true], ["2", false], ["100", false], ["101", true]] as const) {
      fireEvent.change(input, { target: { value } });
      expect(button).toHaveProperty("disabled", disabled);
    }
  });

  it("efface l'erreur d'un export PDF raté dès la tentative suivante", async () => {
    vi.mocked(exportGridsAsPdf).mockRejectedValueOnce(new Error("raté")).mockResolvedValue(undefined);
    renderModal({ grids: [makeGrid()] });
    fireEvent.click(await screen.findByText(/Plusieurs cartes \(PDF\)/));
    fireEvent.click(screen.getByRole("button", { name: "Générer le PDF" }));
    expect(await screen.findByText(/Impossible de générer le PDF/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Générer le PDF" }));
    });
    expect(screen.queryByText(/Impossible de générer le PDF/)).not.toBeInTheDocument();
  });

  describe("avec un worker configuré", () => {
    beforeEach(() => {
      vi.stubEnv("VITE_SYNC_WORKER_URL", "https://sync.example.workers.dev");
    });

    const openJoin = () => {
      fireEvent.click(screen.getByRole("button", { name: "Saisir un code" }));
      return screen.getByPlaceholderText("XXXX XXXX");
    };

    it("expose l'état de synchro par classe et libellé (désactivé : vide ; en cours)", () => {
      const r = renderModal({ remoteSync: makeRemoteSync({ code: "ABCDEFGH", status: "disabled" }) });
      expect(document.querySelector(".sync-status")?.className).toBe("sync-status sync-status--disabled");
      expect(document.querySelector(".sync-status")?.textContent).toBe("");
      rerenderModal(r, { remoteSync: makeRemoteSync({ code: "ABCDEFGH", status: "syncing" }) });
      expect(document.querySelector(".sync-status")?.textContent).toBe("Synchronisation…");
    });

    it("n'affiche pas le message d'erreur du hook quand l'état n'est pas en erreur", () => {
      renderModal({ remoteSync: makeRemoteSync({ code: "ABCDEFGH", status: "synced", errorMessage: "Ancienne panne" }) });
      expect(screen.queryByText("Ancienne panne")).not.toBeInTheDocument();
      expect(screen.getByText("Synchronisé ✓")).toBeInTheDocument();
    });

    it("n'affiche pas d'erreur de création quand l'état n'est pas en erreur", () => {
      renderModal({ remoteSync: makeRemoteSync({ status: "synced", errorMessage: "Ancienne panne" }) });
      expect(screen.queryByText("Ancienne panne")).not.toBeInTheDocument();
      expect(document.querySelector(".modal-error")).not.toBeInTheDocument();
    });

    it("« Rejoindre » reste désactivé pour une saisie d'espaces", () => {
      renderModal({ remoteSync: makeRemoteSync() });
      fireEvent.change(openJoin(), { target: { value: "   " } });
      expect(screen.getByRole("button", { name: "Rejoindre" })).toBeDisabled();
    });

    it("Entrée rejoint, mais pas une autre touche ; une autre touche que Échap ne referme pas", () => {
      const joinCode = vi.fn().mockResolvedValue("invalid");
      renderModal({ remoteSync: makeRemoteSync({ joinCode }) });
      const input = openJoin();
      fireEvent.change(input, { target: { value: "ABCDEFGH" } });
      fireEvent.keyDown(input, { key: "a" });
      expect(joinCode).not.toHaveBeenCalled();
      expect(screen.getByPlaceholderText("XXXX XXXX")).toBeInTheDocument();
      fireEvent.keyDown(input, { key: "Enter" });
      expect(joinCode).toHaveBeenCalledWith("ABCDEFGH");
    });

    it("le message précis du hook n'écrase pas l'erreur « invalide »", async () => {
      const joinCode = vi.fn().mockResolvedValue("invalid");
      renderModal({ remoteSync: makeRemoteSync({ joinCode, errorMessage: "Failed to fetch" }) });
      fireEvent.change(openJoin(), { target: { value: "ABCDEFGH" } });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Rejoindre" }));
      });
      expect(screen.getByText("Code invalide (8 caractères attendus).")).toBeInTheDocument();
      expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
    });

    it("une nouvelle tentative réussie efface l'erreur précédente et vide la saisie", async () => {
      const joinCode = vi.fn().mockResolvedValueOnce("not-found").mockResolvedValueOnce("joined");
      renderModal({ remoteSync: makeRemoteSync({ joinCode }) });
      fireEvent.change(openJoin(), { target: { value: "ABCDEFGH" } });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Rejoindre" }));
      });
      expect(screen.getByText("Ce code de synchronisation est introuvable.")).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Rejoindre" }));
      });
      expect(screen.queryByText("Ce code de synchronisation est introuvable.")).not.toBeInTheDocument();
      expect(openJoin()).toHaveValue("");
    });
  });
});

