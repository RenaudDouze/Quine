import { useEffect, useState } from "react";

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // stockage indisponible (mode privé, quota...) : on ignore silencieusement
    }
  }, [key, value]);

  // Synchronise avec les changements faits dans un autre onglet/fenêtre sur
  // la même clé : `storage` n'est jamais émis dans l'onglet d'origine
  // (seulement dans les autres onglets ouverts sur la même app), donc pas de
  // risque de boucle avec l'écriture ci-dessus. `initialValue` n'est
  // volontairement pas dans les dépendances : comme pour l'état initial de
  // `useState` ci-dessus, seule sa valeur au montage compte.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      if (e.newValue === null) {
        setValue(initialValue);
        return;
      }
      try {
        setValue(JSON.parse(e.newValue) as T);
      } catch {
        // JSON invalide écrit par un autre onglet : on ignore, la valeur
        // actuelle reste affichée plutôt que de planter.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue] as const;
}
