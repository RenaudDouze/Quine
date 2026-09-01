import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { createSyncCode, fetchSyncState, isValidSyncCode, normalizeSyncCode, pushSyncState } from "../lib/remoteSync";
import type { Grid } from "../lib/bingo";

export type RemoteSyncStatus = "disabled" | "syncing" | "synced" | "error";
export type JoinSyncCodeOutcome = "invalid" | "not-found" | "error" | "joined";

const POLL_INTERVAL_MS = 20_000;
// Laisse le temps à plusieurs changements rapprochés (ex: quelques clics de
// suite) de se regrouper en une seule requête, plutôt que d'en envoyer une
// par changement — le plan gratuit de Cloudflare KV plafonne à 1000
// écritures/jour pour tout le worker (voir worker/README.md), un usage actif
// avec des changements espacés de plus de quelques secondes peut sinon s'en
// approcher.
const PUSH_DEBOUNCE_MS = 5_000;

export interface UseRemoteSyncResult {
  code: string | null;
  status: RemoteSyncStatus;
  errorMessage: string | null;
  createCode: () => Promise<boolean>;
  joinCode: (rawCode: string) => Promise<JoinSyncCodeOutcome>;
  disable: () => void;
}

/** Synchronise `grids` avec le worker Cloudflare, tant qu'un code est actif
 * (voir worker/README.md pour le mécanisme côté serveur — écriture optimiste
 * par numéro de version). Sondage périodique pour récupérer les changements
 * des autres appareils, poussée différée des changements locaux. `workerUrl`
 * absent (fonctionnalité non configurée) désactive silencieusement toute
 * action réseau : le hook reste utilisable sans jamais rien synchroniser.
 * `onRemoteUpdate` est appelé quand des grilles plus récentes que ce que cet
 * appareil connaît déjà arrivent depuis un autre appareil — que ce soit un
 * sondage ultérieur pendant que l'app est déjà ouverte, un conflit résolu en
 * adoptant le serveur, ou le tout premier sondage au montage (ex : rouvrir
 * l'app sur un appareil qui a déjà un code actif, mais dont un autre appareil
 * a poussé des changements entre-temps). La dernière version connue étant
 * persistée (voir `lastSyncedVersionRef` ci-dessous), ce premier sondage
 * reste silencieux si cet appareil est justement celui qui a écrit cette
 * version en dernier — recharger la page ne redéclenche pas la notification
 * pour rien. */
export function useRemoteSync(
  workerUrl: string | undefined,
  grids: Grid[],
  setGrids: (next: Grid[]) => void,
  onRemoteUpdate?: () => void
): UseRemoteSyncResult {
  const [code, setCode] = useLocalStorage<string | null>("bingo.sync.code.v1", null);
  const [status, setStatus] = useState<RemoteSyncStatus>(code ? "syncing" : "disabled");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dernière version connue comme reflétant à la fois l'état local et celui
  // du serveur : sert à décider si une réponse du sondage apporte vraiment du
  // neuf, et de base pour la prochaine poussée (voir worker/README.md — un
  // entier attribué par le serveur, jamais une horloge cliente). En ref (pas
  // en state) pour l'usage courant : lu depuis des callbacks différés, sans
  // avoir besoin de redéclencher un rendu quand il change. Aussi persisté en
  // storage (via `setSyncedVersion` ci-dessous), pour survivre à un
  // rechargement de page : sans ça, la ref repartirait de 0 à chaque montage,
  // et le tout premier sondage — même si ce même appareil est celui qui a
  // écrit cette version en dernier, sans rien de neuf ailleurs — la verrait
  // toujours comme « plus récente », déclenchant à tort la notification de
  // mise à jour distante.
  const [storedVersion, setStoredVersion] = useLocalStorage("bingo.sync.version.v1", 0);
  const lastSyncedVersionRef = useRef(storedVersion);
  // Identité stable (comme `setStoredVersion`, un setter de useState) : peut
  // figurer dans un tableau de dépendances d'effet sans le redéclencher à
  // chaque rendu.
  const setSyncedVersion = useCallback(
    (version: number) => {
      lastSyncedVersionRef.current = version;
      setStoredVersion(version);
    },
    [setStoredVersion]
  );
  // Vrai le temps d'appliquer un `grids` reçu du serveur : évite que l'effet
  // de poussée ci-dessous ne le retransmette aussitôt comme s'il s'agissait
  // d'une modification locale (boucle infinie).
  const applyingRemoteRef = useRef(false);
  // Le tout premier passage de l'effet de poussée suit le montage du
  // composant (grilles déjà chargées depuis le stockage local) : jamais une
  // vraie modification à transmettre, seulement l'état déjà en place.
  const isFirstPushEffectRunRef = useRef(true);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gridsRef = useRef(grids);
  gridsRef.current = grids;
  const onRemoteUpdateRef = useRef(onRemoteUpdate);
  onRemoteUpdateRef.current = onRemoteUpdate;

  useEffect(() => {
    if (!workerUrl || !code) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const remote = await fetchSyncState(workerUrl, code);
        if (cancelled) return;
        if (remote === null) {
          // Code expiré côté serveur (inactivité prolongée) ou jamais
          // existé : rien à synchroniser, on désactive plutôt que de
          // sonder indéfiniment un code mort.
          setStatus("error");
          setErrorMessage("Ce code de synchronisation n'existe plus.");
          setCode(null);
          return;
        }
        if (remote.version > lastSyncedVersionRef.current) {
          applyingRemoteRef.current = true;
          setSyncedVersion(remote.version);
          setGrids(remote.grids);
          onRemoteUpdateRef.current?.();
        }
        setStatus("synced");
        setErrorMessage(null);
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [workerUrl, code, setGrids, setCode, setSyncedVersion]);

  useEffect(() => {
    const isFirstRun = isFirstPushEffectRunRef.current;
    isFirstPushEffectRunRef.current = false;

    if (!workerUrl || !code || isFirstRun) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }

    clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(async () => {
      try {
        const result = await pushSyncState(workerUrl, code, {
          baseVersion: lastSyncedVersionRef.current,
          grids: gridsRef.current,
        });
        if (result.accepted) {
          setSyncedVersion(result.state.version);
        } else {
          // Un autre appareil a poussé entre-temps (baseVersion n'est plus la
          // version courante) : on adopte la sienne plutôt que de perdre ses
          // changements.
          applyingRemoteRef.current = true;
          setSyncedVersion(result.state.version);
          setGrids(result.state.grids);
          onRemoteUpdateRef.current?.();
        }
        setStatus("synced");
        setErrorMessage(null);
      } catch {
        setStatus("error");
      }
    }, PUSH_DEBOUNCE_MS);

    return () => clearTimeout(pushTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grids]);

  const createCode = async (): Promise<boolean> => {
    if (!workerUrl) return false;
    setStatus("syncing");
    setErrorMessage(null);
    try {
      const newCode = await createSyncCode(workerUrl);
      // Un code fraîchement créé démarre à la version 0 (voir handleCreate
      // côté worker) : aucun autre appareil n'a pu le modifier entre-temps,
      // cette poussée avec baseVersion 0 aboutit donc toujours du premier
      // coup — pas besoin de retenter avec une autre valeur.
      const result = await pushSyncState(workerUrl, newCode, { baseVersion: 0, grids: gridsRef.current });
      setSyncedVersion(result.state.version);
      setCode(newCode);
      setStatus("synced");
      return true;
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Impossible de créer un code de synchronisation.");
      return false;
    }
  };

  const joinCode = async (rawCode: string): Promise<JoinSyncCodeOutcome> => {
    const normalized = normalizeSyncCode(rawCode);
    if (!isValidSyncCode(normalized)) return "invalid";
    if (!workerUrl) return "error";

    setStatus("syncing");
    setErrorMessage(null);
    try {
      const remote = await fetchSyncState(workerUrl, normalized);
      if (remote === null) {
        setStatus("error");
        return "not-found";
      }

      const current = gridsRef.current;
      const shouldReplace =
        current.length === 0 ||
        window.confirm(
          `Remplacer tes ${current.length} grille(s) actuelle(s) par celles du code ?\n\nAnnuler pour les ajouter à la suite.`
        );

      if (shouldReplace) {
        applyingRemoteRef.current = true;
        setSyncedVersion(remote.version);
        setGrids(remote.grids);
      } else {
        // La fusion crée un état qui n'existe encore nulle part ailleurs :
        // on le pousse explicitement plutôt que d'attendre le prochain
        // changement local.
        const merged = [...current, ...remote.grids];
        const result = await pushSyncState(workerUrl, normalized, { baseVersion: remote.version, grids: merged });
        applyingRemoteRef.current = true;
        if (result.accepted) {
          setSyncedVersion(result.state.version);
          setGrids(merged);
        } else {
          // Un autre appareil a poussé entre la lecture ci-dessus et cette
          // fusion : on adopte sa version plutôt que d'écraser ses
          // changements avec une fusion devenue périmée.
          setSyncedVersion(result.state.version);
          setGrids(result.state.grids);
        }
      }

      setCode(normalized);
      setStatus("synced");
      return "joined";
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Impossible de rejoindre ce code.");
      return "error";
    }
  };

  const disable = () => {
    clearTimeout(pushTimerRef.current);
    setSyncedVersion(0);
    setCode(null);
    setStatus("disabled");
    setErrorMessage(null);
  };

  return { code, status, errorMessage, createCode, joinCode, disable };
}
