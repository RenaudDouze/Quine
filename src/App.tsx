import { useEffect } from "react";
import { useHashRoute } from "./hooks/useHashRoute";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useSystemDarkMode } from "./hooks/useSystemDarkMode";
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

  switch (route.name) {
    case "editor":
      return <EditorView key={route.id} id={route.id} />;
    case "play":
      return route.id ? (
        <PlayView key={route.id} id={route.id} />
      ) : (
        <HomeView themePreference={themePreference} onThemePreferenceChange={setThemePreference} />
      );
    default:
      return <HomeView themePreference={themePreference} onThemePreferenceChange={setThemePreference} />;
  }
}
