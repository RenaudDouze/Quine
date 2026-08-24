import { useEffect, useState } from "react";

const QUERY = "(prefers-color-scheme: dark)";

/** true si le système est actuellement en thème sombre. */
export function useSystemDarkMode(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return dark;
}
