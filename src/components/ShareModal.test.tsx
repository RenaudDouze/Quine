import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import QRCode from "qrcode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCells, type Grid } from "../lib/bingo";
import ShareModal from "./ShareModal";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(),
  },
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
      expect(screen.getByText("Lien copié ✓")).toBeInTheDocument();
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
      expect(screen.getByText("Lien copié ✓")).toBeInTheDocument();
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
});
