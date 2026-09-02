import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { buildCells, type Grid } from "../lib/bingo";
import { loadGrids, saveGrids } from "../lib/storage";
import { useRemoteSync } from "../hooks/useRemoteSync";
import { ErrorBoundary } from "../components/ErrorBoundary";
import HomeView from "./HomeView";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,fake"),
  },
}));

// Enveloppe l'implémentation réelle (délègue à elle par défaut, donc n'affecte
// aucun autre test) : sert uniquement à intercepter le callback
// `onRemoteUpdate` passé par HomeView, pour le déclencher directement plutôt
// que de simuler un aller-retour réseau complet (déjà couvert au niveau du
// hook dans useRemoteSync.test.ts, et bout en bout en e2e).
vi.mock("../hooks/useRemoteSync", async () => {
  const actual = await vi.importActual<typeof import("../hooks/useRemoteSync")>("../hooks/useRemoteSync");
  return { ...actual, useRemoteSync: vi.fn(actual.useRemoteSync) };
});
const defaultUseRemoteSyncImpl = vi.mocked(useRemoteSync).getMockImplementation()!;

// Enveloppe la vraie classe dans un composant fonction (délègue à elle par
// défaut, donc n'affecte aucun autre test) : sert uniquement à simuler
// directement le chemin "chunk introuvable" (voir le test dédié plus bas)
// sans avoir à faire réellement échouer l'import() paresseux de ShareModal.
vi.mock("../components/ErrorBoundary", async () => {
  const actual = await vi.importActual<typeof import("../components/ErrorBoundary")>("../components/ErrorBoundary");
  return {
    ErrorBoundary: vi.fn((props: ComponentProps<typeof actual.ErrorBoundary>) => <actual.ErrorBoundary {...props} />),
  };
});
const defaultErrorBoundaryImpl = vi.mocked(ErrorBoundary).getMockImplementation()!;

function renderHome(props: Partial<Parameters<typeof HomeView>[0]> = {}) {
  const onThemePreferenceChange = vi.fn();
  const result = render(
    <HomeView themePreference="system" onThemePreferenceChange={onThemePreferenceChange} {...props} />
  );
  return { onThemePreferenceChange, ...result };
}

function makeGrid(overrides: Partial<Grid> = {}): Grid {
  const size = overrides.size ?? 3;
  const freeCenter = overrides.freeCenter ?? false;
  const items = overrides.items ?? ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  return {
    id: overrides.id ?? "grid-1",
    title: overrides.title ?? "Ma grille",
    size,
    freeCenter,
    items,
    cells: overrides.cells ?? buildCells(items, size, freeCenter),
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    ...overrides,
  };
}

/** Ouvre le panneau « Personnaliser » d'une grille identifiée par son titre. */
async function openCustomize(user: ReturnType<typeof userEvent.setup>, title: string) {
  const card = screen.getByText(title).closest(".grid-item") as HTMLElement;
  await user.click(within(card).getByRole("button", { name: "Personnaliser" }));
}

// La recherche, le thème, la synchronisation, le plein écran et le filtre
// archivées vivent dans le menu déroulant de l'en-tête, replié par défaut :
// chaque test qui les exerce doit d'abord l'ouvrir, comme dans +1.
function openMenu() {
  // Préfixe seul (regex) : le libellé complet gagne un suffixe quand la
  // synchro est en erreur (voir "indicateur d'erreur de synchro...").
  const trigger = screen.queryByRole("button", { name: /^Ouvrir le menu/ });
  if (trigger) fireEvent.click(trigger);
}

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  cleanup();
});

describe("HomeView", () => {
  it("navigates to the editor when creating a grid from the empty state", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole("button", { name: /créer ma première grille/i }));
    expect(window.location.hash).toBe("#editor");
  });

  it("navigates to the editor from the topbar button when grids exist", async () => {
    const user = userEvent.setup();
    saveGrids([makeGrid()]);
    renderHome();
    await user.click(screen.getByRole("button", { name: "+ Nouvelle grille" }));
    expect(window.location.hash).toBe("#editor");
  });

  it("renders grids in their stored order, with pinned grids floated to the top", () => {
    saveGrids([
      makeGrid({ id: "a", title: "Alpha" }),
      makeGrid({ id: "b", title: "Bravo", pinned: true }),
      makeGrid({ id: "c", title: "Charlie" }),
    ]);
    renderHome();
    const titles = screen.getAllByText(/Alpha|Bravo|Charlie/).map((el) => el.textContent);
    expect(titles).toEqual(["Bravo", "Alpha", "Charlie"]);
  });

  it("shows the free-center hint in the card meta", () => {
    saveGrids([makeGrid({ freeCenter: true })]);
    renderHome();
    expect(screen.getByText(/case libre/i)).toBeInTheDocument();
  });

  it("renders the grid's board directly on the home page, ready to play", () => {
    saveGrids([makeGrid({ id: "g1" })]);
    renderHome();
    expect(screen.getAllByRole("button", { name: /^[A-I]$/ })).toHaveLength(9);
  });

  it("marks a cell from the home page and persists it on the targeted grid only", async () => {
    const user = userEvent.setup();
    saveGrids([makeGrid({ id: "g1" }), makeGrid({ id: "g2", title: "Autre grille" })]);
    renderHome();
    const card = screen.getByText("Ma grille").closest(".grid-item") as HTMLElement;
    const cell = within(card).getAllByRole("button", { name: /^[A-I]$/ })[0];
    await user.click(cell);
    expect(cell).toHaveClass("marked");

    const grids = loadGrids();
    expect(grids.find((g) => g.id === "g1")!.cells.some((c) => c.marked)).toBe(true);
    expect(grids.find((g) => g.id === "g2")!.cells.some((c) => c.marked)).toBe(false);
  });

  it("opens the edit modal, pre-filled, when editing, and closes it without saving", async () => {
    const user = userEvent.setup();
    saveGrids([makeGrid({ id: "g1", title: "Ma grille" })]);
    renderHome();
    await user.click(screen.getByRole("button", { name: "Modifier" }));
    expect(window.location.hash).toBe("");
    expect(screen.getByText('Modifier « Ma grille »')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/écrivez chaque phrase/i)).toHaveValue("A\nB\nC\nD\nE\nF\nG\nH\nI");
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByText('Modifier « Ma grille »')).not.toBeInTheDocument();
  });

  it("saves the edited grid and closes the modal", async () => {
    const user = userEvent.setup();
    saveGrids([makeGrid({ id: "g1", title: "Ma grille" })]);
    renderHome();
    await user.click(screen.getByRole("button", { name: "Modifier" }));
    await user.selectOptions(screen.getByRole("combobox", { name: /condition de victoire/i }), "corners");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(screen.queryByText('Modifier « Ma grille »')).not.toBeInTheDocument();
    const saved = loadGrids().find((g) => g.id === "g1")!;
    expect(saved.title).toBe("Ma grille");
    expect(saved.winRule).toBe("corners");
  });

  it.each([
    ["system", "Auto", "light"],
    ["light", "Clair", "dark"],
    ["dark", "Sombre", "system"],
  ] as const)(
    "cycles the theme preference from %s to %s",
    async (current, label, next) => {
      const user = userEvent.setup();
      const { onThemePreferenceChange } = renderHome({ themePreference: current });
      openMenu();
      const toggle = screen.getByRole("button", { name: `Thème : ${label}` });
      await user.click(toggle);
      expect(onThemePreferenceChange).toHaveBeenCalledWith(next);
    }
  );

  describe("suppression et annulation", () => {
    it("deletes a grid immediately (no confirmation dialog) and shows an undo toast", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid({ id: "g1", title: "À virer" })]);
      renderHome();
      await openCustomize(user, "À virer");
      await user.click(screen.getByRole("button", { name: /Supprimer cette grille/ }));

      expect(screen.queryByText("À virer")).not.toBeInTheDocument();
      expect(loadGrids()).toHaveLength(0);
      expect(screen.getByText(/Grille « À virer » supprimée/)).toBeInTheDocument();
    });

    it("restores the grid when Annuler is clicked on the undo toast", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid({ id: "g1", title: "À restaurer" })]);
      renderHome();
      await openCustomize(user, "À restaurer");
      await user.click(screen.getByRole("button", { name: /Supprimer cette grille/ }));
      await user.click(screen.getByRole("button", { name: "Annuler" }));

      expect(screen.getByText("À restaurer")).toBeInTheDocument();
      expect(loadGrids()).toHaveLength(1);
    });

    it("hides the undo toast once dismissed", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid({ id: "g1", title: "À virer" })]);
      renderHome();
      await openCustomize(user, "À virer");
      await user.click(screen.getByRole("button", { name: /Supprimer cette grille/ }));
      await user.click(screen.getByRole("button", { name: "Annuler" }));

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("auto-dismisses the undo toast after the timeout", () => {
      vi.useFakeTimers();
      saveGrids([makeGrid({ id: "g1", title: "À virer" })]);
      renderHome();
      fireEvent.click(screen.getByRole("button", { name: "Personnaliser" }));
      fireEvent.click(screen.getByRole("button", { name: /Supprimer cette grille/ }));
      expect(screen.getByRole("status")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      vi.useRealTimers();
    });
  });

  describe("personnalisation (nom, couleur, image de fond, mélange, réinitialisation, épinglage, archivage, duplication)", () => {
    it("opens and closes the customize modal", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid({ id: "g1", title: "Ma grille" })]);
      renderHome();
      await openCustomize(user, "Ma grille");
      expect(screen.getByText('Personnaliser « Ma grille »')).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Fermer" }));
      expect(screen.queryByText('Personnaliser « Ma grille »')).not.toBeInTheDocument();
    });

    it("renames the targeted grid only via the Nom field, leaving other grids untouched", async () => {
      const user = userEvent.setup();
      saveGrids([
        makeGrid({ id: "g1", title: "Ma grille" }),
        makeGrid({ id: "g2", title: "Autre grille" }),
      ]);
      renderHome();
      await openCustomize(user, "Ma grille");
      const nameInput = screen.getByRole("textbox", { name: "Nom de la grille" });
      await user.clear(nameInput);
      await user.type(nameInput, "Nouveau nom");
      await user.tab();

      const grids = loadGrids();
      expect(grids.find((g) => g.id === "g1")?.title).toBe("Nouveau nom");
      expect(grids.find((g) => g.id === "g2")?.title).toBe("Autre grille");
      expect(screen.getByText('Personnaliser « Ma grille »')).toBeInTheDocument();
    });

    it("reshuffles the targeted grid's cells only, once confirmed, and closes the modal", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      saveGrids([
        makeGrid({ id: "g1", title: "Ma grille" }),
        makeGrid({ id: "g2", title: "Autre grille" }),
      ]);
      renderHome();
      const before = loadGrids().find((g) => g.id === "g1")!.cells.map((c) => c.label);
      const otherBefore = loadGrids().find((g) => g.id === "g2")!.cells.map((c) => c.label);

      await openCustomize(user, "Ma grille");
      await user.click(screen.getByRole("button", { name: /remélanger/i }));
      expect(confirmSpy).toHaveBeenCalledWith("Remélanger la grille ? Les cases cochées seront effacées.");

      const grids = loadGrids();
      const after = grids.find((g) => g.id === "g1")!.cells.map((c) => c.label);
      expect(after.slice().sort()).toEqual(before.slice().sort());
      expect(grids.find((g) => g.id === "g2")!.cells.map((c) => c.label)).toEqual(otherBefore);
      expect(screen.queryByText('Personnaliser « Ma grille »')).not.toBeInTheDocument();
    });

    it("does not reshuffle when the confirmation is declined", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(false);
      saveGrids([makeGrid({ id: "g1", title: "Ma grille" })]);
      renderHome();
      const before = loadGrids()[0].cells.map((c) => c.label);

      await openCustomize(user, "Ma grille");
      await user.click(screen.getByRole("button", { name: /remélanger/i }));

      expect(loadGrids()[0].cells.map((c) => c.label)).toEqual(before);
      expect(screen.getByText('Personnaliser « Ma grille »')).toBeInTheDocument();
    });

    it("resets marks on the targeted grid only, once confirmed, keeping the free cell marked", async () => {
      const user = userEvent.setup();
      const items = Array.from({ length: 24 }, (_, i) => `item-${i}`);
      saveGrids([
        makeGrid({ id: "g1", title: "Ma grille", size: 5, freeCenter: true, items }),
        makeGrid({ id: "g2", title: "Autre grille" }),
      ]);
      renderHome();
      const card = screen.getByText("Ma grille").closest(".grid-item") as HTMLElement;
      await user.click(within(card).getAllByRole("button", { name: /^item-/ })[0]);

      vi.spyOn(window, "confirm").mockReturnValue(true);
      await openCustomize(user, "Ma grille");
      await user.click(screen.getByRole("button", { name: /réinitialiser/i }));

      const saved = loadGrids().find((g) => g.id === "g1")!;
      expect(saved.cells.find((c) => c.free)!.marked).toBe(true);
      expect(saved.cells.filter((c) => !c.free).every((c) => !c.marked)).toBe(true);
    });

    it("does not reset marks when the confirmation is declined", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid({ id: "g1", title: "Ma grille" })]);
      renderHome();
      const card = screen.getByText("Ma grille").closest(".grid-item") as HTMLElement;
      const cell = within(card).getAllByRole("button", { name: /^[A-I]$/ })[0];
      await user.click(cell);
      expect(cell).toHaveClass("marked");

      vi.spyOn(window, "confirm").mockReturnValue(false);
      await openCustomize(user, "Ma grille");
      await user.click(screen.getByRole("button", { name: /réinitialiser/i }));

      expect(cell).toHaveClass("marked");
    });

    it("persists the chosen color on the targeted grid only, leaving other grids untouched", async () => {
      const user = userEvent.setup();
      saveGrids([
        makeGrid({ id: "g1", title: "Ma grille" }),
        makeGrid({ id: "g2", title: "Autre grille" }),
      ]);
      renderHome();
      await openCustomize(user, "Ma grille");
      await user.click(screen.getByRole("button", { name: "Choisir la couleur #db2777" }));

      const grids = loadGrids();
      expect(grids.find((g) => g.id === "g1")?.color).toBe("#db2777");
      expect(grids.find((g) => g.id === "g2")?.color).toBeUndefined();
      const card = screen.getByText("Ma grille").closest(".grid-item") as HTMLElement;
      expect(card.style.getPropertyValue("--card-accent")).toBe("#db2777");
    });

    it("persists a valid background image URL on the targeted grid only, leaving other grids untouched", async () => {
      const user = userEvent.setup();
      saveGrids([
        makeGrid({ id: "g1", title: "Ma grille" }),
        makeGrid({ id: "g2", title: "Autre grille" }),
      ]);
      renderHome();
      await openCustomize(user, "Ma grille");
      const input = screen.getByPlaceholderText(/exemple.com/i);
      fireEvent.change(input, { target: { value: "https://example.com/bg.jpg" } });
      fireEvent.blur(input);

      const grids = loadGrids();
      expect(grids.find((g) => g.id === "g1")?.backgroundImageUrl).toBe("https://example.com/bg.jpg");
      expect(grids.find((g) => g.id === "g2")?.backgroundImageUrl).toBeUndefined();
    });

    it("pins a grid, floating it to the top of the list", async () => {
      const user = userEvent.setup();
      saveGrids([
        makeGrid({ id: "a", title: "Alpha" }),
        makeGrid({ id: "b", title: "Bravo" }),
      ]);
      renderHome();
      await openCustomize(user, "Bravo");
      await user.click(screen.getByRole("button", { name: /Épingler en haut/ }));

      const titles = screen.getAllByText(/Alpha|Bravo/).map((el) => el.textContent);
      expect(titles).toEqual(["Bravo", "Alpha"]);
      expect(loadGrids().find((g) => g.title === "Bravo")?.pinned).toBe(true);
    });

    it("unpins an already-pinned grid", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid({ id: "g1", title: "Épinglée", pinned: true })]);
      renderHome();
      await openCustomize(user, "Épinglée");
      await user.click(screen.getByRole("button", { name: /Détacher cette grille/ }));

      expect(loadGrids()[0].pinned).toBe(false);
    });

    it("archives a grid, moving it out of the active list into the archived view", async () => {
      const user = userEvent.setup();
      saveGrids([
        makeGrid({ id: "a", title: "Alpha" }),
        makeGrid({ id: "b", title: "Bravo" }),
      ]);
      renderHome();
      await openCustomize(user, "Bravo");
      await user.click(screen.getByRole("button", { name: /Archiver cette grille/ }));

      expect(screen.queryByText("Bravo")).not.toBeInTheDocument();
      expect(screen.getByText("Alpha")).toBeInTheDocument();

      openMenu();
      await user.click(screen.getByRole("button", { name: /Vue :/ }));
      expect(screen.getByText("Bravo")).toBeInTheDocument();
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    });

    it("unarchives a grid from the archived view, moving it back to the active view", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid({ id: "g1", title: "Archivée", archived: true })]);
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: /Vue :/ }));
      await openCustomize(user, "Archivée");
      await user.click(screen.getByRole("button", { name: /Désarchiver cette grille/ }));

      expect(screen.queryByText("Archivée")).not.toBeInTheDocument();
      openMenu();
      await user.click(screen.getByRole("button", { name: /Vue :/ }));
      expect(screen.getByText("Archivée")).toBeInTheDocument();
    });

    it("shows a locked hint and disables appearance controls for an archived grid", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid({ id: "g1", title: "Archivée", archived: true })]);
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: /Vue :/ }));
      await openCustomize(user, "Archivée");

      expect(screen.getByText(/grille archivée/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Choisir la couleur #2563eb" })).toBeDisabled();
    });

    it("duplicates a grid via the customize modal, without carrying over pin/archive state", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid({ id: "g1", title: "Original", pinned: true })]);
      renderHome();
      await openCustomize(user, "Original");
      await user.click(screen.getByRole("button", { name: /Dupliquer cette grille/ }));

      expect(screen.getByText("Original (copie)")).toBeInTheDocument();
      const grids = loadGrids();
      expect(grids).toHaveLength(2);
      const copy = grids.find((g) => g.title === "Original (copie)")!;
      expect(copy.pinned).toBe(false);
      expect(copy.archived).toBe(false);
    });
  });

  describe("recherche", () => {
    it("does not show the search button when there are no grids", () => {
      renderHome();
      openMenu();
      expect(screen.queryByRole("button", { name: "Rechercher" })).not.toBeInTheDocument();
    });

    it("opens a search field and filters grids by title", async () => {
      const user = userEvent.setup();
      saveGrids([
        makeGrid({ id: "a", title: "Bingo réunion" }),
        makeGrid({ id: "b", title: "Bingo vacances" }),
      ]);
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Rechercher" }));
      await user.type(screen.getByPlaceholderText(/rechercher une grille/i), "vacances");

      expect(screen.queryByText("Bingo réunion")).not.toBeInTheDocument();
      expect(screen.getByText("Bingo vacances")).toBeInTheDocument();
    });

    it("shows a no-match message when nothing matches the query", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid({ title: "Bingo réunion" })]);
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Rechercher" }));
      await user.type(screen.getByPlaceholderText(/rechercher une grille/i), "introuvable");

      expect(screen.getByText(/aucune grille ne correspond à/i)).toBeInTheDocument();
    });

    it("clears the query and closes the search field", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid({ title: "Bingo réunion" })]);
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Rechercher" }));
      await user.type(screen.getByPlaceholderText(/rechercher une grille/i), "introuvable");
      await user.click(screen.getByRole("button", { name: "Fermer la recherche" }));

      expect(screen.queryByPlaceholderText(/rechercher une grille/i)).not.toBeInTheDocument();
      expect(screen.getByText("Bingo réunion")).toBeInTheDocument();
    });

    it("closes the search field on Escape", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid({ title: "Bingo réunion" })]);
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Rechercher" }));
      fireEvent.keyDown(screen.getByPlaceholderText(/rechercher une grille/i), { key: "Escape" });

      expect(screen.queryByPlaceholderText(/rechercher une grille/i)).not.toBeInTheDocument();
    });
  });

  describe("glisser-déposer (éligibilité)", () => {
    it("shows a drag handle when nothing is filtered and no grid is archived", () => {
      saveGrids([makeGrid({ id: "a", title: "Alpha" }), makeGrid({ id: "b", title: "Bravo" })]);
      renderHome();
      expect(screen.getAllByRole("button", { name: "Réordonner" })).toHaveLength(2);
    });

    it("hides drag handles while a search query is active", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid({ id: "a", title: "Alpha" }), makeGrid({ id: "b", title: "Bravo" })]);
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Rechercher" }));
      await user.type(screen.getByPlaceholderText(/rechercher une grille/i), "Alpha");

      expect(screen.queryByRole("button", { name: "Réordonner" })).not.toBeInTheDocument();
    });

    it("hides drag handles on the active tab as soon as any grid is archived", () => {
      saveGrids([
        makeGrid({ id: "a", title: "Alpha" }),
        makeGrid({ id: "b", title: "Bravo", archived: true }),
      ]);
      renderHome();
      expect(screen.queryByRole("button", { name: "Réordonner" })).not.toBeInTheDocument();
    });
  });

  describe("synchronisation", () => {
    it("opens the sync modal with every grid and closes it", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid({ id: "g1", title: "Une grille" })]);
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Synchroniser mes grilles" }));
      expect(await screen.findByText("Synchroniser mes grilles", { selector: "h2" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Fermer" }));
      expect(screen.queryByText("Synchroniser mes grilles", { selector: "h2" })).not.toBeInTheDocument();
    });

    it("replaces grids via the sync modal's JSON import when confirmed", async () => {
      saveGrids([makeGrid({ id: "old", title: "Ancienne" })]);
      renderHome();
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Synchroniser mes grilles" }));
      vi.spyOn(window, "confirm").mockReturnValue(true); // replace

      await screen.findByRole("button", { name: "Importer" });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(
        [JSON.stringify([{ title: "Importée", size: 3, items: ["A"] }])],
        "backup.json",
        { type: "application/json" }
      );
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
      });

      expect(screen.queryByText("Ancienne")).not.toBeInTheDocument();
      expect(screen.getByText("Importée")).toBeInTheDocument();
      expect(loadGrids()).toHaveLength(1);
    });

    it("imports grids via the sync modal's JSON import", async () => {
      saveGrids([makeGrid({ id: "old", title: "Ancienne" })]);
      renderHome();
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Synchroniser mes grilles" }));
      vi.spyOn(window, "confirm").mockReturnValue(false); // merge

      await screen.findByRole("button", { name: "Importer" });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(
        [JSON.stringify([{ title: "Importée", size: 3, items: ["A"] }])],
        "backup.json",
        { type: "application/json" }
      );
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
      });

      expect(screen.getByText("Ancienne")).toBeInTheDocument();
      expect(screen.getByText("Importée")).toBeInTheDocument();
      expect(loadGrids()).toHaveLength(2);
    });
  });

  describe("partage d'une grille", () => {
    it("opens the share modal for a single grid and closes it", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid({ id: "g1", title: "Ma grille à partager" })]);
      renderHome();
      await user.click(screen.getByRole("button", { name: "Partager" }));
      expect(
        await screen.findByText('Partager "Ma grille à partager"', { selector: "h2" })
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Fermer" }));
      expect(
        screen.queryByText('Partager "Ma grille à partager"', { selector: "h2" })
      ).not.toBeInTheDocument();
    });

    it("does not offer a JSON import/export section when sharing a single grid", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid({ id: "g1" })]);
      renderHome();
      await user.click(screen.getByRole("button", { name: "Partager" }));
      await screen.findByRole("button", { name: "Fermer" });
      expect(screen.queryByText("Fichier de sauvegarde")).not.toBeInTheDocument();
    });

    it("shares only the targeted grid, not the whole list", async () => {
      const user = userEvent.setup();
      saveGrids([
        makeGrid({ id: "g1", title: "Grille A" }),
        makeGrid({ id: "g2", title: "Grille B" }),
      ]);
      renderHome();
      const cards = screen.getAllByRole("button", { name: "Partager" });
      await user.click(cards[0]);
      expect(await screen.findByText('Partager "Grille A"', { selector: "h2" })).toBeInTheDocument();
    });
  });

  describe("raccourci PWA (?action=)", () => {
    it("navigates to the editor for ?action=new", () => {
      window.history.pushState({}, "", "/?action=new");
      renderHome();
      expect(window.location.hash).toBe("#editor");
    });

    it("opens the sync modal for ?action=sync", async () => {
      window.history.pushState({}, "", "/?action=sync");
      renderHome();
      expect(await screen.findByText("Synchroniser mes grilles", { selector: "h2" })).toBeInTheDocument();
    });

    it("cleans the action param from the URL after handling it", () => {
      window.history.pushState({}, "", "/?action=sync");
      renderHome();
      expect(window.location.search).toBe("");
    });

    it("does nothing when there is no action param", () => {
      saveGrids([makeGrid({ title: "Ancienne" })]);
      renderHome();
      expect(window.location.hash).toBe("");
      expect(screen.queryByText("Synchroniser mes grilles", { selector: "h2" })).not.toBeInTheDocument();
    });

    it("ignores an unknown action value", () => {
      window.history.pushState({}, "", "/?action=bogus");
      renderHome();
      expect(window.location.hash).toBe("");
      expect(screen.queryByText("Synchroniser mes grilles", { selector: "h2" })).not.toBeInTheDocument();
      expect(window.location.search).toBe("");
    });
  });

  describe("mode plein écran", () => {
    afterEach(() => {
      // @ts-expect-error -- pas typé sur Document par défaut, ajouté par le composant
      delete document.documentElement.requestFullscreen;
      // @ts-expect-error -- idem
      delete document.exitFullscreen;
    });

    it("is not offered when there are no grids", () => {
      renderHome();
      openMenu();
      expect(screen.queryByRole("button", { name: "Mode plein écran" })).not.toBeInTheDocument();
    });

    it("hides the topbar and shows an exit button while active", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid()]);
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Mode plein écran" }));

      expect(screen.queryByRole("button", { name: "+ Nouvelle grille" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Quitter le mode plein écran" })).toBeInTheDocument();
      expect(screen.getByText("Ma grille")).toBeInTheDocument();
    });

    it("returns to the normal view when the exit button is clicked", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid()]);
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Mode plein écran" }));
      await user.click(screen.getByRole("button", { name: "Quitter le mode plein écran" }));

      expect(screen.getByRole("button", { name: "+ Nouvelle grille" })).toBeInTheDocument();
    });

    it("returns to the normal view on Escape while active", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid()]);
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Mode plein écran" }));
      fireEvent.keyDown(document, { key: "Escape" });

      expect(screen.getByRole("button", { name: "+ Nouvelle grille" })).toBeInTheDocument();
    });

    it("ignores a key other than Escape while active", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid()]);
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Mode plein écran" }));
      fireEvent.keyDown(document, { key: "Enter" });

      expect(screen.getByRole("button", { name: "Quitter le mode plein écran" })).toBeInTheDocument();
    });

    it("ignores Escape while not active", () => {
      saveGrids([makeGrid()]);
      renderHome();
      fireEvent.keyDown(document, { key: "Escape" });

      expect(screen.getByRole("button", { name: "+ Nouvelle grille" })).toBeInTheDocument();
    });

    it("requests native fullscreen when entering focus mode", async () => {
      const user = userEvent.setup();
      const requestFullscreen = vi.fn().mockResolvedValue(undefined);
      document.documentElement.requestFullscreen = requestFullscreen;
      saveGrids([makeGrid()]);
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Mode plein écran" }));

      expect(requestFullscreen).toHaveBeenCalledTimes(1);
    });

    it("silently ignores a rejected fullscreen request", async () => {
      const user = userEvent.setup();
      document.documentElement.requestFullscreen = vi.fn().mockRejectedValue(new Error("nope"));
      saveGrids([makeGrid()]);
      renderHome();
      openMenu();
      await act(async () => {
        await user.click(screen.getByRole("button", { name: "Mode plein écran" }));
      });

      expect(screen.getByRole("button", { name: "Quitter le mode plein écran" })).toBeInTheDocument();
    });

    it("exits native fullscreen when leaving focus mode while still in it", async () => {
      const user = userEvent.setup();
      document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined);
      const exitFullscreen = vi.fn().mockResolvedValue(undefined);
      document.exitFullscreen = exitFullscreen;
      saveGrids([makeGrid()]);
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Mode plein écran" }));

      Object.defineProperty(document, "fullscreenElement", {
        value: document.documentElement,
        configurable: true,
      });
      await user.click(screen.getByRole("button", { name: "Quitter le mode plein écran" }));

      expect(exitFullscreen).toHaveBeenCalledTimes(1);
      Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
    });

    it("does not call exitFullscreen when leaving focus mode outside of native fullscreen", async () => {
      const user = userEvent.setup();
      const exitFullscreen = vi.fn().mockResolvedValue(undefined);
      document.exitFullscreen = exitFullscreen;
      saveGrids([makeGrid()]);
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Mode plein écran" }));
      await user.click(screen.getByRole("button", { name: "Quitter le mode plein écran" }));

      expect(exitFullscreen).not.toHaveBeenCalled();
    });

    it("silently ignores a rejected exitFullscreen call", async () => {
      const user = userEvent.setup();
      document.exitFullscreen = vi.fn().mockRejectedValue(new Error("nope"));
      saveGrids([makeGrid()]);
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Mode plein écran" }));

      Object.defineProperty(document, "fullscreenElement", {
        value: document.documentElement,
        configurable: true,
      });
      await act(async () => {
        await user.click(screen.getByRole("button", { name: "Quitter le mode plein écran" }));
      });

      expect(screen.getByRole("button", { name: "+ Nouvelle grille" })).toBeInTheDocument();
      Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
    });

    it("syncs back to the normal view when fullscreen is exited natively (fullscreenchange event)", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid()]);
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Mode plein écran" }));

      fireEvent(document, new Event("fullscreenchange"));

      expect(screen.getByRole("button", { name: "+ Nouvelle grille" })).toBeInTheDocument();
    });

    it("does not react to fullscreenchange while still in native fullscreen", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid()]);
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Mode plein écran" }));

      Object.defineProperty(document, "fullscreenElement", {
        value: document.documentElement,
        configurable: true,
      });
      fireEvent(document, new Event("fullscreenchange"));

      expect(screen.queryByRole("button", { name: "+ Nouvelle grille" })).not.toBeInTheDocument();
      Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
    });
  });

  describe("notification de mise à jour à distance", () => {
    afterEach(() => {
      vi.mocked(useRemoteSync).mockImplementation(defaultUseRemoteSyncImpl);
    });

    it("affiche un message quand useRemoteSync signale une mise à jour reçue d'un autre appareil, qui disparaît après le délai", () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      let triggerRemoteUpdate: (() => void) | undefined;
      vi.mocked(useRemoteSync).mockImplementation((_workerUrl, _grids, _setGrids, onRemoteUpdate) => {
        triggerRemoteUpdate = onRemoteUpdate;
        return {
          code: null,
          status: "disabled",
          errorMessage: null,
          createCode: async () => false,
          joinCode: async () => "error",
          disable: () => {},
        };
      });

      renderHome();
      act(() => {
        triggerRemoteUpdate?.();
      });
      expect(screen.getByText("Grilles mises à jour depuis un autre appareil")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(4100);
      });
      expect(screen.queryByText("Grilles mises à jour depuis un autre appareil")).not.toBeInTheDocument();
      vi.useRealTimers();
    });
  });

  describe("indicateur d'erreur de synchro visible en dehors de la modale", () => {
    afterEach(() => {
      vi.mocked(useRemoteSync).mockImplementation(defaultUseRemoteSyncImpl);
    });

    it("marque le bouton du menu quand la synchro est en erreur, sans avoir à ouvrir la modale Synchroniser", () => {
      vi.mocked(useRemoteSync).mockReturnValue({
        code: "ABCDEFGH",
        status: "error",
        errorMessage: "Failed to fetch",
        createCode: async () => false,
        joinCode: async () => "error",
        disable: () => {},
      });

      renderHome();

      const menuBtn = screen.getByRole("button", { name: "Ouvrir le menu (erreur de synchronisation)" });
      expect(menuBtn).toHaveClass("icon-btn--alert");
    });

    it("marque aussi le bouton Synchroniser du menu déroulant quand la synchro est en erreur", () => {
      vi.mocked(useRemoteSync).mockReturnValue({
        code: "ABCDEFGH",
        status: "error",
        errorMessage: "Failed to fetch",
        createCode: async () => false,
        joinCode: async () => "error",
        disable: () => {},
      });

      renderHome();
      openMenu();

      const syncBtn = screen.getByRole("button", { name: "Synchroniser mes grilles (erreur de synchronisation)" });
      expect(syncBtn).toHaveClass("icon-btn--alert");
    });

    it("n'affiche aucun indicateur quand la synchro n'est pas en erreur", () => {
      vi.mocked(useRemoteSync).mockReturnValue({
        code: "ABCDEFGH",
        status: "synced",
        errorMessage: null,
        createCode: async () => false,
        joinCode: async () => "error",
        disable: () => {},
      });

      renderHome();
      openMenu();

      expect(screen.getByRole("button", { name: "Masquer le menu" })).not.toHaveClass("icon-btn--alert");
      expect(screen.getByRole("button", { name: "Synchroniser mes grilles" })).not.toHaveClass("icon-btn--alert");
      expect(screen.queryByRole("button", { name: /erreur de synchronisation/ })).not.toBeInTheDocument();
    });
  });

  describe("secours si un panneau chargé à la demande n'a pas pu se charger (chunk introuvable après un déploiement)", () => {
    afterEach(() => {
      vi.mocked(ErrorBoundary).mockImplementation(defaultErrorBoundaryImpl);
    });

    it("propose de recharger la page plutôt que de laisser une page blanche (modale de synchro)", async () => {
      vi.mocked(ErrorBoundary).mockImplementation(({ fallback }) => fallback(() => {}));
      const user = userEvent.setup();
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Synchroniser mes grilles" }));

      expect(screen.getByText("Synchroniser mes grilles", { selector: "h2" })).toBeInTheDocument();
      expect(
        screen.getByText(
          "Ce panneau n'a pas pu se charger — une nouvelle version de l'app est probablement disponible. Recharge la page pour la récupérer."
        )
      ).toBeInTheDocument();
    });

    it('recharge la page au clic sur "Recharger la page"', async () => {
      const reloadSpy = vi.fn();
      vi.mocked(ErrorBoundary).mockImplementation(({ fallback }) => fallback(reloadSpy));
      const user = userEvent.setup();
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Synchroniser mes grilles" }));

      fireEvent.click(screen.getByRole("button", { name: "Recharger la page" }));
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });

    it('referme le secours sans recharger au clic sur "Fermer"', async () => {
      vi.mocked(ErrorBoundary).mockImplementation(({ fallback }) => fallback(() => {}));
      const user = userEvent.setup();
      renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Synchroniser mes grilles" }));

      fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
      expect(screen.queryByText("Synchroniser mes grilles", { selector: "h2" })).not.toBeInTheDocument();
    });

    it("referme le secours au clic sur l'arrière-plan, sans que le clic sur le panneau lui-même ne le ferme", async () => {
      vi.mocked(ErrorBoundary).mockImplementation(({ fallback }) => fallback(() => {}));
      const user = userEvent.setup();
      const { container } = renderHome();
      openMenu();
      await user.click(screen.getByRole("button", { name: "Synchroniser mes grilles" }));

      fireEvent.click(container.querySelector(".modal-panel")!);
      expect(screen.getByText("Synchroniser mes grilles", { selector: "h2" })).toBeInTheDocument();

      fireEvent.click(container.querySelector(".modal-overlay")!);
      expect(screen.queryByText("Synchroniser mes grilles", { selector: "h2" })).not.toBeInTheDocument();
    });

    it("montre le même secours pour le partage d'une seule grille, avec son propre titre et sa propre fermeture", async () => {
      vi.mocked(ErrorBoundary).mockImplementation(({ fallback }) => fallback(() => {}));
      saveGrids([makeGrid({ title: "Grille à partager" })]);
      const user = userEvent.setup();
      renderHome();
      await user.click(screen.getByRole("button", { name: "Partager" }));

      expect(screen.getByText('Partager "Grille à partager"', { selector: "h2" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
      expect(screen.queryByText('Partager "Grille à partager"', { selector: "h2" })).not.toBeInTheDocument();
    });
  });

  describe("secours si une modale plante à l'affichage (Personnaliser/Modifier)", () => {
    afterEach(() => {
      vi.mocked(ErrorBoundary).mockImplementation(defaultErrorBoundaryImpl);
    });

    it("propose de recharger la page plutôt que de laisser une page blanche (modale Personnaliser)", async () => {
      vi.mocked(ErrorBoundary).mockImplementation(({ fallback }) => fallback(() => {}));
      saveGrids([makeGrid({ title: "Ma grille" })]);
      const user = userEvent.setup();
      renderHome();
      await openCustomize(user, "Ma grille");

      expect(screen.getByText("Personnaliser « Ma grille »", { selector: "h2" })).toBeInTheDocument();
      expect(
        screen.getByText("Une erreur est survenue en affichant cette fenêtre. Recharge la page pour continuer.")
      ).toBeInTheDocument();
    });

    it('recharge la page au clic sur "Recharger la page" (modale Personnaliser)', async () => {
      const reloadSpy = vi.fn();
      vi.mocked(ErrorBoundary).mockImplementation(({ fallback }) => fallback(reloadSpy));
      saveGrids([makeGrid({ title: "Ma grille" })]);
      const user = userEvent.setup();
      renderHome();
      await openCustomize(user, "Ma grille");

      fireEvent.click(screen.getByRole("button", { name: "Recharger la page" }));
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });

    it('referme le secours sans recharger au clic sur "Fermer" (modale Personnaliser)', async () => {
      vi.mocked(ErrorBoundary).mockImplementation(({ fallback }) => fallback(() => {}));
      saveGrids([makeGrid({ title: "Ma grille" })]);
      const user = userEvent.setup();
      renderHome();
      await openCustomize(user, "Ma grille");

      fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
      expect(screen.queryByText("Personnaliser « Ma grille »", { selector: "h2" })).not.toBeInTheDocument();
    });

    it("montre le même secours pour la modale Modifier, avec son propre titre et sa propre fermeture", async () => {
      vi.mocked(ErrorBoundary).mockImplementation(({ fallback }) => fallback(() => {}));
      saveGrids([makeGrid({ title: "Ma grille" })]);
      const user = userEvent.setup();
      renderHome();
      await user.click(screen.getByRole("button", { name: "Modifier" }));

      expect(screen.getByText("Modifier « Ma grille »", { selector: "h2" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
      expect(screen.queryByText("Modifier « Ma grille »", { selector: "h2" })).not.toBeInTheDocument();
    });
  });
});
