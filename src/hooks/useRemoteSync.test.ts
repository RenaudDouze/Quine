import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRemoteSync } from "./useRemoteSync";
import { createSyncCode, fetchSyncState, pushSyncState } from "../lib/remoteSync";
import type { Grid } from "../lib/bingo";

vi.mock("../lib/remoteSync", async () => {
  const actual = await vi.importActual<typeof import("../lib/remoteSync")>("../lib/remoteSync");
  return {
    ...actual,
    createSyncCode: vi.fn(),
    fetchSyncState: vi.fn(),
    pushSyncState: vi.fn(),
  };
});

const WORKER_URL = "https://sync.example.workers.dev";

function makeGrid(overrides: Partial<Grid> = {}): Grid {
  return {
    id: "a",
    title: "Grille",
    size: 3,
    freeCenter: false,
    items: ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
    cells: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

/** Composant hôte minimal : un hook seul ne peut pas gérer son propre état
 * `grids` entre les rendus (`renderHook` ne le fait pas à sa place), donc on
 * le porte ici comme le ferait HomeView.tsx. */
function useHost(workerUrl: string | undefined, initial: Grid[], onRemoteUpdate?: () => void) {
  const [grids, setGrids] = useState(initial);
  const sync = useRemoteSync(workerUrl, grids, setGrids, onRemoteUpdate);
  return { grids, setGrids, sync };
}

describe("useRemoteSync", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(createSyncCode).mockReset();
    vi.mocked(fetchSyncState).mockReset();
    vi.mocked(pushSyncState).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("état initial", () => {
    it("démarre désactivé sans code stocké", () => {
      const { result } = renderHook(() => useHost(WORKER_URL, []));
      expect(result.current.sync.code).toBeNull();
      expect(result.current.sync.status).toBe("disabled");
    });
  });

  describe("createCode", () => {
    it("ne fait rien sans workerUrl configuré", async () => {
      const { result } = renderHook(() => useHost(undefined, []));
      let outcome: boolean | undefined;
      await act(async () => {
        outcome = await result.current.sync.createCode();
      });
      expect(outcome).toBe(false);
      expect(createSyncCode).not.toHaveBeenCalled();
    });

    it("crée un code, pousse les grilles actuelles avec baseVersion 0 et se synchronise", async () => {
      vi.mocked(createSyncCode).mockResolvedValue("ABCDEFGH");
      vi.mocked(pushSyncState).mockResolvedValue({ accepted: true, state: { version: 1, grids: [] } });
      // Le code fraîchement défini déclenche aussitôt le sondage périodique
      // (effet séparé) : le mocker aussi pour ne pas fausser le statut final.
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 1, grids: [] });
      const initial = [makeGrid()];
      const { result } = renderHook(() => useHost(WORKER_URL, initial));

      let outcome: boolean | undefined;
      await act(async () => {
        outcome = await result.current.sync.createCode();
      });

      expect(outcome).toBe(true);
      expect(result.current.sync.code).toBe("ABCDEFGH");
      expect(result.current.sync.status).toBe("synced");
      // Un code fraîchement créé démarre à la version 0 côté serveur (voir
      // handleCreate) : la première poussée part toujours de là, un seul
      // appel suffit (pas de retry — voir worker/README.md pour pourquoi
      // un numéro de version élimine le besoin d'en gérer un ici).
      expect(pushSyncState).toHaveBeenCalledTimes(1);
      expect(pushSyncState).toHaveBeenCalledWith(WORKER_URL, "ABCDEFGH", {
        baseVersion: 0,
        grids: initial,
      });
    });

    it("signale une erreur si la création échoue côté serveur", async () => {
      vi.mocked(createSyncCode).mockRejectedValue(new Error("boom"));
      const { result } = renderHook(() => useHost(WORKER_URL, []));

      let outcome: boolean | undefined;
      await act(async () => {
        outcome = await result.current.sync.createCode();
      });

      expect(outcome).toBe(false);
      expect(result.current.sync.status).toBe("error");
      expect(result.current.sync.errorMessage).toContain("Impossible de créer");
      expect(result.current.sync.code).toBeNull();
    });
  });

  describe("joinCode", () => {
    it("refuse un code au mauvais format sans appel réseau", async () => {
      const { result } = renderHook(() => useHost(WORKER_URL, []));
      let outcome: string | undefined;
      await act(async () => {
        outcome = await result.current.sync.joinCode("trop-court");
      });
      expect(outcome).toBe("invalid");
      expect(fetchSyncState).not.toHaveBeenCalled();
    });

    it("renvoie une erreur si le format est valide mais sans workerUrl configuré", async () => {
      const { result } = renderHook(() => useHost(undefined, []));
      let outcome: string | undefined;
      await act(async () => {
        outcome = await result.current.sync.joinCode("ABCDEFGH");
      });
      expect(outcome).toBe("error");
    });

    it('signale "not-found" pour un code inconnu du serveur', async () => {
      vi.mocked(fetchSyncState).mockResolvedValue(null);
      const { result } = renderHook(() => useHost(WORKER_URL, []));
      let outcome: string | undefined;
      await act(async () => {
        outcome = await result.current.sync.joinCode("ABCDEFGH");
      });
      expect(outcome).toBe("not-found");
      expect(result.current.sync.status).toBe("error");
    });

    it("adopte directement la version distante quand aucune grille locale (pas de confirmation demandée)", async () => {
      const confirmSpy = vi.spyOn(window, "confirm");
      const remoteGrids = [makeGrid({ id: "distant" })];
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 50, grids: remoteGrids });
      const { result } = renderHook(() => useHost(WORKER_URL, []));

      let outcome: string | undefined;
      await act(async () => {
        outcome = await result.current.sync.joinCode("abcd-efgh");
      });

      expect(outcome).toBe("joined");
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(result.current.grids).toEqual(remoteGrids);
      expect(result.current.sync.code).toBe("ABCDEFGH");
    });

    it("remplace les grilles locales si la confirmation est acceptée", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const remoteGrids = [makeGrid({ id: "distant" })];
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 50, grids: remoteGrids });
      const { result } = renderHook(() => useHost(WORKER_URL, [makeGrid({ id: "local" })]));

      await act(async () => {
        await result.current.sync.joinCode("ABCDEFGH");
      });

      expect(result.current.grids).toEqual(remoteGrids);
      expect(pushSyncState).not.toHaveBeenCalled();
    });

    it("fusionne (et repousse depuis la version lue) les grilles si la confirmation est refusée", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const localGrid = makeGrid({ id: "local" });
      const remoteGrid = makeGrid({ id: "distant" });
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 50, grids: [remoteGrid] });
      vi.mocked(pushSyncState).mockResolvedValue({
        accepted: true,
        state: { version: 51, grids: [localGrid, remoteGrid] },
      });
      const { result } = renderHook(() => useHost(WORKER_URL, [localGrid]));

      await act(async () => {
        await result.current.sync.joinCode("ABCDEFGH");
      });

      expect(result.current.grids).toEqual([localGrid, remoteGrid]);
      expect(pushSyncState).toHaveBeenCalledWith(WORKER_URL, "ABCDEFGH", {
        baseVersion: 50,
        grids: [localGrid, remoteGrid],
      });
    });

    it("adopte la version serveur si la poussée de fusion est refusée (un autre appareil a poussé entre-temps)", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const localGrid = makeGrid({ id: "local" });
      const remoteGrid = makeGrid({ id: "distant" });
      const serverGrids = [makeGrid({ id: "depuis-un-autre-appareil" })];
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 50, grids: [remoteGrid] });
      vi.mocked(pushSyncState).mockResolvedValue({ accepted: false, state: { version: 51, grids: serverGrids } });
      const { result } = renderHook(() => useHost(WORKER_URL, [localGrid]));

      await act(async () => {
        await result.current.sync.joinCode("ABCDEFGH");
      });

      // La fusion calculée localement est devenue périmée : on adopte l'état
      // serveur renvoyé plutôt que de l'écraser avec.
      expect(result.current.grids).toEqual(serverGrids);
    });

    it("signale une erreur si la requête réseau échoue", async () => {
      vi.mocked(fetchSyncState).mockRejectedValue(new Error("boom"));
      const { result } = renderHook(() => useHost(WORKER_URL, []));
      let outcome: string | undefined;
      await act(async () => {
        outcome = await result.current.sync.joinCode("ABCDEFGH");
      });
      expect(outcome).toBe("error");
      expect(result.current.sync.errorMessage).toContain("Impossible de rejoindre");
    });
  });

  describe("sondage périodique (pull)", () => {
    it("applique au montage une version distante plus récente pour un code déjà actif", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      const remoteGrids = [makeGrid({ id: "depuis-serveur" })];
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 10, grids: remoteGrids });

      const { result } = renderHook(() => useHost(WORKER_URL, []));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(result.current.grids).toEqual(remoteGrids);
      expect(result.current.sync.status).toBe("synced");
    });

    it("n'applique rien de nouveau si le sondage suivant renvoie le même numéro de version", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      const remoteGrids = [makeGrid({ id: "depuis-serveur" })];
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 10, grids: remoteGrids });

      const { result } = renderHook(() => useHost(WORKER_URL, []));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });
      const gridsAfterFirstPoll = result.current.grids;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });

      expect(result.current.grids).toBe(gridsAfterFirstPoll);
    });

    it("désactive la synchro si le code a expiré côté serveur (404)", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      vi.mocked(fetchSyncState).mockResolvedValue(null);

      const { result } = renderHook(() => useHost(WORKER_URL, []));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(result.current.sync.code).toBeNull();
      expect(result.current.sync.status).toBe("error");
      expect(result.current.sync.errorMessage).toContain("n'existe plus");
    });

    it("signale une erreur si le sondage échoue, sans toucher aux grilles", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      vi.mocked(fetchSyncState).mockRejectedValue(new Error("réseau coupé"));
      const initial = [makeGrid()];

      const { result } = renderHook(() => useHost(WORKER_URL, initial));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(result.current.sync.status).toBe("error");
      expect(result.current.grids).toEqual(initial);
    });

    it("ignore une réponse de succès qui arrive après le démontage", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      let resolvePoll!: (value: { version: number; grids: Grid[] }) => void;
      vi.mocked(fetchSyncState).mockReturnValue(new Promise((resolve) => (resolvePoll = resolve)));

      const { unmount } = renderHook(() => useHost(WORKER_URL, []));
      unmount();
      await act(async () => {
        resolvePoll({ version: 1, grids: [makeGrid()] });
        await vi.runAllTimersAsync();
      });
      // N'aurait de toute façon rien à vérifier de visible (démonté) : le
      // test couvre surtout que la résolution tardive ne lève aucune erreur.
    });

    it("ignore un échec de sondage qui arrive après le démontage", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      let rejectPoll!: (reason: unknown) => void;
      vi.mocked(fetchSyncState).mockReturnValue(new Promise((_resolve, reject) => (rejectPoll = reject)));

      const { unmount } = renderHook(() => useHost(WORKER_URL, []));
      unmount();
      await act(async () => {
        rejectPoll(new Error("trop tard"));
        await vi.runAllTimersAsync();
      });
    });

    it("n'appelle pas onRemoteUpdate au premier sondage si la version distante correspond déjà à la dernière connue de cet appareil (recharger la page sur l'appareil qui a poussé en dernier)", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      window.localStorage.setItem("bingo.sync.version.v1", JSON.stringify(7));
      const grids = [makeGrid()];
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 7, grids });
      const onRemoteUpdate = vi.fn();

      const { result } = renderHook(() => useHost(WORKER_URL, grids, onRemoteUpdate));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(onRemoteUpdate).not.toHaveBeenCalled();
      // Pas de ré-application inutile des grilles déjà en place.
      expect(result.current.grids).toBe(grids);
    });

    it("appelle onRemoteUpdate au premier sondage si la version distante dépasse la dernière connue de cet appareil (un autre appareil a poussé pendant que celui-ci était fermé)", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      window.localStorage.setItem("bingo.sync.version.v1", JSON.stringify(7));
      const remoteGrids = [makeGrid({ id: "depuis-un-autre-appareil" })];
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 9, grids: remoteGrids });
      const onRemoteUpdate = vi.fn();

      const { result } = renderHook(() => useHost(WORKER_URL, [], onRemoteUpdate));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(onRemoteUpdate).toHaveBeenCalledTimes(1);
      expect(result.current.grids).toEqual(remoteGrids);
    });

    it("persiste la version reçue, pour rester silencieux après un rechargement de page tant que rien de neuf", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 10, grids: [] });

      renderHook(() => useHost(WORKER_URL, []));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(window.localStorage.getItem("bingo.sync.version.v1")).toBe(JSON.stringify(10));
    });

    it("appelle onRemoteUpdate dès le tout premier sondage au montage (ex : rouvrir l'app sur un appareil déjà relié à un code)", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 10, grids: [makeGrid()] });
      const onRemoteUpdate = vi.fn();

      renderHook(() => useHost(WORKER_URL, [], onRemoteUpdate));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(onRemoteUpdate).toHaveBeenCalledTimes(1);
    });

    it("appelle de nouveau onRemoteUpdate quand un sondage suivant apporte une version plus récente", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 10, grids: [] });
      const onRemoteUpdate = vi.fn();

      renderHook(() => useHost(WORKER_URL, [], onRemoteUpdate));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });
      expect(onRemoteUpdate).toHaveBeenCalledTimes(1);

      const remoteGrids = [makeGrid({ id: "depuis-un-autre-appareil" })];
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 11, grids: remoteGrids });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });

      expect(onRemoteUpdate).toHaveBeenCalledTimes(2);
    });

    it("n'appelle plus onRemoteUpdate quand un sondage suivant ne renvoie rien de nouveau", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 10, grids: [] });
      const onRemoteUpdate = vi.fn();

      renderHook(() => useHost(WORKER_URL, [], onRemoteUpdate));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });
      expect(onRemoteUpdate).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });

      // Toujours 1 : le sondage suivant renvoie la même version, rien à
      // signaler de plus.
      expect(onRemoteUpdate).toHaveBeenCalledTimes(1);
    });

    it("n'interroge plus le serveur une fois le composant démonté", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 1, grids: [] });

      const { unmount } = renderHook(() => useHost(WORKER_URL, []));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });
      const callsBeforeUnmount = vi.mocked(fetchSyncState).mock.calls.length;
      unmount();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(vi.mocked(fetchSyncState).mock.calls.length).toBe(callsBeforeUnmount);
    });
  });

  describe("poussée différée (push) des changements locaux", () => {
    it("ne pousse rien pour l'état déjà en place au montage (hydratation, pas une vraie modification)", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 0, grids: [] });
      renderHook(() => useHost(WORKER_URL, [makeGrid()]));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });

      expect(pushSyncState).not.toHaveBeenCalled();
    });

    it("pousse un changement local après le délai de regroupement, depuis la dernière version connue", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 0, grids: [] });
      vi.mocked(pushSyncState).mockResolvedValue({ accepted: true, state: { version: 1, grids: [] } });
      const { result } = renderHook(() => useHost(WORKER_URL, []));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      const edited = [makeGrid({ title: "Modifiée" })];
      act(() => {
        result.current.setGrids(edited);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_500);
      });

      expect(pushSyncState).toHaveBeenCalledWith(WORKER_URL, "ABCDEFGH", {
        baseVersion: 0,
        grids: edited,
      });
      expect(result.current.sync.status).toBe("synced");
      // Persistée : un rechargement juste après ne redéclenchera pas la
      // notification de mise à jour distante pour cette même version.
      expect(window.localStorage.getItem("bingo.sync.version.v1")).toBe(JSON.stringify(1));
    });

    it("ne renvoie qu'une seule requête pour plusieurs changements rapprochés", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 0, grids: [] });
      vi.mocked(pushSyncState).mockResolvedValue({ accepted: true, state: { version: 1, grids: [] } });
      const { result } = renderHook(() => useHost(WORKER_URL, []));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      act(() => {
        result.current.setGrids([makeGrid({ title: "Un" })]);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      act(() => {
        result.current.setGrids([makeGrid({ title: "Deux" })]);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_500);
      });

      expect(pushSyncState).toHaveBeenCalledTimes(1);
    });

    it("adopte la version serveur quand la poussée est refusée (409, un autre appareil a poussé entre-temps)", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 0, grids: [] });
      const serverGrids = [makeGrid({ id: "depuis-un-autre-appareil" })];
      vi.mocked(pushSyncState).mockResolvedValue({
        accepted: false,
        state: { version: 999, grids: serverGrids },
      });
      const { result } = renderHook(() => useHost(WORKER_URL, []));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      act(() => {
        result.current.setGrids([makeGrid({ title: "Modifiée" })]);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_500);
      });

      expect(result.current.grids).toEqual(serverGrids);
      // L'application de la version serveur ne doit pas elle-même redéclencher
      // une poussée (boucle infinie) : une seule requête au total.
      expect(pushSyncState).toHaveBeenCalledTimes(1);
    });

    it("appelle onRemoteUpdate quand la poussée est refusée et que la version serveur est adoptée", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 0, grids: [] });
      vi.mocked(pushSyncState).mockResolvedValue({
        accepted: false,
        state: { version: 999, grids: [makeGrid({ id: "depuis-un-autre-appareil" })] },
      });
      const onRemoteUpdate = vi.fn();
      const { result } = renderHook(() => useHost(WORKER_URL, [], onRemoteUpdate));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });
      expect(onRemoteUpdate).not.toHaveBeenCalled();

      act(() => {
        result.current.setGrids([makeGrid({ title: "Modifiée" })]);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_500);
      });

      expect(onRemoteUpdate).toHaveBeenCalledTimes(1);
    });

    it("signale une erreur si la poussée échoue", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 0, grids: [] });
      vi.mocked(pushSyncState).mockRejectedValue(new Error("boom"));
      const { result } = renderHook(() => useHost(WORKER_URL, []));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      act(() => {
        result.current.setGrids([makeGrid({ title: "Modifiée" })]);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_500);
      });

      expect(result.current.sync.status).toBe("error");
    });

    it("ne pousse rien tant qu'aucun code n'est actif", async () => {
      const { result } = renderHook(() => useHost(WORKER_URL, []));
      act(() => {
        result.current.setGrids([makeGrid({ title: "Modifiée" })]);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(pushSyncState).not.toHaveBeenCalled();
    });
  });

  describe("disable", () => {
    it("efface le code, repasse en désactivé et annule une poussée en attente", async () => {
      window.localStorage.setItem("bingo.sync.code.v1", JSON.stringify("ABCDEFGH"));
      vi.mocked(fetchSyncState).mockResolvedValue({ version: 0, grids: [] });
      const { result } = renderHook(() => useHost(WORKER_URL, []));
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      act(() => {
        result.current.setGrids([makeGrid({ title: "Modifiée" })]);
      });
      act(() => {
        result.current.sync.disable();
      });

      expect(result.current.sync.code).toBeNull();
      expect(result.current.sync.status).toBe("disabled");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(pushSyncState).not.toHaveBeenCalled();
    });
  });
});
