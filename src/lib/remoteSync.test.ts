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
  });
});
