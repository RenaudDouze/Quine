import { useEffect, useState } from "react";

const QUERY = "(prefers-color-scheme: dark)";

/** true si le système est actuellement en thème sombre. */
export function useSystemDarkMode(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(
    () => {
      const mql = window.matchMedia(QUERY);
      const handler = (e: MediaQueryListEvent) => setDark(e.matches);
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    },
    // Stryker disable next-line ArrayDeclaration: `[]` et un tableau constant non vide sont équivalents (effet monté une seule fois)
    [],
  );

  return dark;
}
