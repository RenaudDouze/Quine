import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSyncCode,
  fetchSyncState,
  formatSyncCode,
  isValidSyncCode,
  normalizeSyncCode,
  pushSyncState,
} from "./remoteSync";
import type { Grid } from "./bingo";

const WORKER_URL = "https://sync.example.workers.dev";

function makeGrid(overrides: Partial<Grid> = {}): Grid {
  return {
    id: "fixed-id",
    title: "Grille test",
    size: 3,
    freeCenter: false,
    items: ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
    cells: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("normalizeSyncCode", () => {
  it("met en majuscules", () => {
    expect(normalizeSyncCode("abcdefgh")).toBe("ABCDEFGH");
  });

  it("retire les tirets et espaces", () => {
    expect(normalizeSyncCode("  abcd-efgh  ")).toBe("ABCDEFGH");
  });
});

describe("isValidSyncCode", () => {
  it("accepte un code de 8 caractères valides", () => {
    expect(isValidSyncCode("ABCDEFGH")).toBe(true);
  });

  it("refuse une longueur incorrecte", () => {
    expect(isValidSyncCode("ABCDEFG")).toBe(false);
  });

  it("refuse un caractère hors de l'alphabet (ex: O ambigu)", () => {
    expect(isValidSyncCode("ABCDEFGO")).toBe(false);
  });
});

describe("formatSyncCode", () => {
  it("insère un espace au milieu pour la lecture", () => {
    expect(formatSyncCode("ABCDEFGH")).toBe("ABCD EFGH");
  });
});

describe("appels réseau", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("createSyncCode", () => {
    it("crée un nouveau code via POST", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ code: "ABCDEFGH" }, 201));
      const code = await createSyncCode(WORKER_URL);
      expect(code).toBe("ABCDEFGH");
      expect(fetch).toHaveBeenCalledWith(`${WORKER_URL}/api/sync`, { method: "POST" });
    });

    it("lève une erreur si la requête échoue", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
      await expect(createSyncCode(WORKER_URL)).rejects.toThrow("Impossible de créer un code");
    });

    it("lève une erreur si la réponse est un JSON illisible", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("pas du json", { status: 201 }));
      await expect(createSyncCode(WORKER_URL)).rejects.toThrow("illisible");
    });

    it("inclut le détail renvoyé par le worker quand la requête échoue (ex : exception interne)", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ error: "Erreur interne du serveur.", detail: "Cannot read properties of undefined" }, 500)
      );
      await expect(createSyncCode(WORKER_URL)).rejects.toThrow(
        new Error("Impossible de créer un code de synchronisation. (Cannot read properties of undefined)")
      );
    });

    it("ignore un détail qui n'est pas une chaîne (ne l'ajoute pas au message)", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "Erreur interne du serveur.", detail: 42 }, 500));
      await expect(createSyncCode(WORKER_URL)).rejects.toThrow(
        new Error("Impossible de créer un code de synchronisation.")
      );
    });
  });

  describe("fetchSyncState", () => {
    it("renvoie l'état stocké", async () => {
      const state = { version: 42, grids: [makeGrid()] };
      vi.mocked(fetch).mockResolvedValue(jsonResponse(state));
      await expect(fetchSyncState(WORKER_URL, "ABCDEFGH")).resolves.toEqual(state);
      expect(fetch).toHaveBeenCalledWith(`${WORKER_URL}/api/sync/ABCDEFGH`);
    });

    it("renvoie null pour un code inconnu (404)", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
      await expect(fetchSyncState(WORKER_URL, "ABCDEFGH")).resolves.toBeNull();
    });

    it("lève une erreur pour tout autre statut en échec", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
      await expect(fetchSyncState(WORKER_URL, "ABCDEFGH")).rejects.toThrow("Impossible de récupérer");
    });

    it("garde le message générique si le corps JSON de l'erreur n'a pas de détail exploitable", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "Method not allowed" }, 405));
      await expect(fetchSyncState(WORKER_URL, "ABCDEFGH")).rejects.toThrow(
        new Error("Impossible de récupérer les grilles synchronisées.")
      );
    });

    it("lève une erreur si le state renvoyé n'a pas la forme attendue (ex : partenaire de synchro buggé, pas d'authentification sur le code)", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ version: 1, grids: [{ oups: true }] }));
      await expect(fetchSyncState(WORKER_URL, "ABCDEFGH")).rejects.toThrow(
        new Error("Réponse du serveur invalide.")
      );
    });

    it("lève une erreur si version n'est pas un nombre", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ version: "1", grids: [] }));
      await expect(fetchSyncState(WORKER_URL, "ABCDEFGH")).rejects.toThrow(
        new Error("Réponse du serveur invalide.")
      );
    });

    it.each([
      ["null", null],
      ["une chaîne", "pas un objet"],
    ])("lève une erreur si le corps de la réponse n'est pas un objet (%s)", async (_label, body) => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(body));
      await expect(fetchSyncState(WORKER_URL, "ABCDEFGH")).rejects.toThrow(
        new Error("Réponse du serveur invalide.")
      );
    });

    it.each([
      ["null", null],
      ["un nombre", 42],
    ])("lève une erreur si un élément de grids n'est pas un objet (%s)", async (_label, element) => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ version: 1, grids: [element] }));
      await expect(fetchSyncState(WORKER_URL, "ABCDEFGH")).rejects.toThrow(
        new Error("Réponse du serveur invalide.")
      );
    });

    it("lève une erreur si un seul élément de grids sur plusieurs est invalide (chaque grille doit être valide, pas juste une seule)", async () => {
      const validGrid = makeGrid();
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ version: 1, grids: [validGrid, { oups: true }] }));
      await expect(fetchSyncState(WORKER_URL, "ABCDEFGH")).rejects.toThrow(
        new Error("Réponse du serveur invalide.")
      );
    });

    // Chacun de ces champs est individuellement requis (aucun ne peut
    // compenser l'absence d'un autre) : chaque cas ne rend qu'un seul champ
    // invalide, tous les autres restant valides.
    it.each([
      ["id", { id: 42 }],
      ["title", { title: 42 }],
      ["size", { size: "3" }],
      ["items", { items: "nope" }],
      ["cells", { cells: "nope" }],
    ])("lève une erreur si %s est le seul champ invalide d'une grille", async (_field, override) => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ version: 1, grids: [{ ...makeGrid(), ...override }] })
      );
      await expect(fetchSyncState(WORKER_URL, "ABCDEFGH")).rejects.toThrow(
        new Error("Réponse du serveur invalide.")
      );
    });
  });

  describe("pushSyncState", () => {
    it("envoie baseVersion/grids et confirme son acceptation", async () => {
      const push = { baseVersion: 3, grids: [makeGrid()] };
      const state = { version: 4, grids: push.grids };
      vi.mocked(fetch).mockResolvedValue(jsonResponse(state));
      const result = await pushSyncState(WORKER_URL, "ABCDEFGH", push);
      expect(result).toEqual({ accepted: true, state });
      expect(fetch).toHaveBeenCalledWith(`${WORKER_URL}/api/sync/ABCDEFGH`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(push),
      });
    });

    it("signale un rejet (409) et renvoie la version serveur actuelle", async () => {
      const serverState = { version: 999, grids: [makeGrid({ title: "Serveur" })] };
      vi.mocked(fetch).mockResolvedValue(jsonResponse(serverState, 409));
      const result = await pushSyncState(WORKER_URL, "ABCDEFGH", { baseVersion: 1, grids: [] });
      expect(result).toEqual({ accepted: false, state: serverState });
    });

    it("lève une erreur pour tout autre statut en échec", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
      await expect(pushSyncState(WORKER_URL, "ABCDEFGH", { baseVersion: 1, grids: [] })).rejects.toThrow(
        "Impossible de synchroniser"
      );
    });

    it("lève une erreur si le state accepté n'a pas la forme attendue", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ version: 1, grids: [{ oups: true }] }));
      await expect(
        pushSyncState(WORKER_URL, "ABCDEFGH", { baseVersion: 0, grids: [] })
      ).rejects.toThrow(new Error("Réponse du serveur invalide."));
    });

    it("lève une erreur si le state renvoyé sur un rejet (409) n'a pas la forme attendue", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ version: 1, grids: [{ oups: true }] }, 409));
      await expect(
        pushSyncState(WORKER_URL, "ABCDEFGH", { baseVersion: 0, grids: [] })
      ).rejects.toThrow(new Error("Réponse du serveur invalide."));
    });
  });
});
