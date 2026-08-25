import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Grid } from "../lib/bingo";
import { loadGrids, saveGrids } from "../lib/storage";
import HomeView from "./HomeView";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,fake"),
  },
}));

function renderHome(props: Partial<Parameters<typeof HomeView>[0]> = {}) {
  const onThemePreferenceChange = vi.fn();
  render(
    <HomeView themePreference="system" onThemePreferenceChange={onThemePreferenceChange} {...props} />
  );
  return { onThemePreferenceChange };
}

function makeGrid(overrides: Partial<Grid> = {}): Grid {
  return {
    id: overrides.id ?? "grid-1",
    title: overrides.title ?? "Ma grille",
    size: overrides.size ?? 3,
    freeCenter: overrides.freeCenter ?? false,
    items: overrides.items ?? ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
    cells: overrides.cells ?? [],
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
  };
}

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
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

  it("sorts multiple grids by most recently updated first", () => {
    saveGrids([
      makeGrid({ id: "older", title: "Ancienne", updatedAt: 1 }),
      makeGrid({ id: "newer", title: "Récente", updatedAt: 2 }),
    ]);
    renderHome();
    const titles = screen.getAllByText(/Ancienne|Récente/).map((el) => el.textContent);
    expect(titles).toEqual(["Récente", "Ancienne"]);
  });

  it("shows the free-center hint in the card meta", () => {
    saveGrids([makeGrid({ freeCenter: true })]);
    renderHome();
    expect(screen.getByText(/case libre/i)).toBeInTheDocument();
  });

  it("navigates to play when a card is clicked", async () => {
    const user = userEvent.setup();
    saveGrids([makeGrid({ id: "g1" })]);
    renderHome();
    await user.click(screen.getByText("Ma grille"));
    expect(window.location.hash).toBe("#play/g1");
  });

  it("navigates to the editor with the grid id when editing", async () => {
    const user = userEvent.setup();
    saveGrids([makeGrid({ id: "g1" })]);
    renderHome();
    await user.click(screen.getByRole("button", { name: "Modifier" }));
    expect(window.location.hash).toBe("#editor/g1");
  });

  it("duplicates a grid and shows the copy", async () => {
    const user = userEvent.setup();
    saveGrids([makeGrid({ id: "g1", title: "Original" })]);
    renderHome();
    await user.click(screen.getByRole("button", { name: "Dupliquer" }));
    expect(screen.getByText("Original (copie)")).toBeInTheDocument();
    expect(loadGrids()).toHaveLength(2);
  });

  it("deletes a grid after confirmation", async () => {
    const user = userEvent.setup();
    saveGrids([makeGrid({ id: "g1", title: "À virer" })]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderHome();
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(screen.queryByText("À virer")).not.toBeInTheDocument();
    expect(loadGrids()).toHaveLength(0);
  });

  it("keeps a grid when deletion is not confirmed", async () => {
    const user = userEvent.setup();
    saveGrids([makeGrid({ id: "g1", title: "À garder" })]);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderHome();
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(screen.getByText("À garder")).toBeInTheDocument();
    expect(loadGrids()).toHaveLength(1);
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
      const toggle = screen.getByRole("button", { name: `Thème : ${label}` });
      await user.click(toggle);
      expect(onThemePreferenceChange).toHaveBeenCalledWith(next);
    }
  );

  describe("synchronisation", () => {
    it("opens the sync modal with every grid and closes it", async () => {
      const user = userEvent.setup();
      saveGrids([makeGrid({ id: "g1", title: "Une grille" })]);
      renderHome();
      await user.click(screen.getByRole("button", { name: "Synchroniser mes grilles" }));
      expect(screen.getByText("Synchroniser mes grilles", { selector: "h2" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Fermer" }));
      expect(screen.queryByText("Synchroniser mes grilles", { selector: "h2" })).not.toBeInTheDocument();
    });

    it("replaces grids via the sync modal's JSON import when confirmed", async () => {
      saveGrids([makeGrid({ id: "old", title: "Ancienne" })]);
      renderHome();
      fireEvent.click(screen.getByRole("button", { name: "Synchroniser mes grilles" }));
      vi.spyOn(window, "confirm").mockReturnValue(true); // replace

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
      fireEvent.click(screen.getByRole("button", { name: "Synchroniser mes grilles" }));
      vi.spyOn(window, "confirm").mockReturnValue(false); // merge

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
        screen.getByText('Partager "Ma grille à partager"', { selector: "h2" })
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
      expect(screen.getByText('Partager "Grille A"', { selector: "h2" })).toBeInTheDocument();
    });
  });
});
