import { useEffect, useState } from "react";
import { useHashRoute } from "./hooks/useHashRoute";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useSystemDarkMode } from "./hooks/useSystemDarkMode";
import { decodeGridsFromParam } from "./lib/share";
import { loadGrids, saveGrids } from "./lib/storage";
import HomeView from "./views/HomeView";
import EditorView from "./views/EditorView";
import PlayView from "./views/PlayView";

export type ThemePreference = "system" | "light" | "dark";

export default function App() {
  const route = useHashRoute();

  const [themePreference, setThemePreference] = useLocalStorage<ThemePreference>(
    "bingo.theme.v1",
    "system"
  );
  const systemDark = useSystemDarkMode();
  const activeTheme = themePreference === "system" ? (systemDark ? "dark" : "light") : themePreference;

  // Le thème est déjà posé une première fois par le script inline
  // d'index.html (pour éviter un flash) ; cet effet le tient à jour et
  // adapte la couleur de la barre de statut du navigateur/PWA en conséquence.
  useEffect(() => {
    document.documentElement.dataset.theme = activeTheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", activeTheme === "dark" ? "#0f172a" : "#f8fafc");
  }, [activeTheme]);

  // Bumped after an import below to force HomeView to remount (and so
  // re-read localStorage): it reads its grid list once at mount via a
  // useState initializer, so a plain save to storage from here wouldn't
  // otherwise be reflected until the next navigation.
  const [importVersion, setImportVersion] = useState(0);

  // Import automatique si l'app est ouverte via un lien/QR de partage
  // (?import=...).
  /* oxlint-disable react/set-state-in-effect -- synchronise avec l'URL au
     chargement (source externe), pas un état dérivable pendant le rendu */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payload = params.get("import");
    if (!payload) return;

    const imported = decodeGridsFromParam(payload);
    const url = new URL(window.location.href);
    url.searchParams.delete("import");
    window.history.replaceState({}, "", url.toString());

    if (!imported || imported.length === 0) return;

    const existing = loadGrids();
    if (existing.length === 0) {
      saveGrids(imported);
    } else {
      const replace = window.confirm(
        `Importer ${imported.length} grille(s) partagée(s) ?\n\nOK pour remplacer tes ${existing.length} grille(s) actuelle(s), Annuler pour les ajouter à la suite.`
      );
      saveGrids(replace ? imported : [...existing, ...imported]);
    }
    setImportVersion((v) => v + 1);
  }, []);
  /* oxlint-enable react/set-state-in-effect */

  switch (route.name) {
    case "editor":
      return <EditorView key={route.id} id={route.id} />;
    case "play":
      return route.id ? (
        <PlayView key={route.id} id={route.id} />
      ) : (
        <HomeView
          key={importVersion}
          themePreference={themePreference}
          onThemePreferenceChange={setThemePreference}
        />
      );
    default:
      return (
        <HomeView
          key={importVersion}
          themePreference={themePreference}
          onThemePreferenceChange={setThemePreference}
        />
      );
  }
}
