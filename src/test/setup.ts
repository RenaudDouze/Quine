import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom n'implémente pas matchMedia : on fournit une implémentation minimale
// réutilisable par tous les tests, que chaque test peut surcharger via
// vi.spyOn si besoin d'un comportement précis (voir useSystemDarkMode.test.ts).
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// jsdom part d'un <head> vide : index.html n'est pas chargé en test, donc on
// reproduit la balise que App.tsx met à jour selon le thème actif.
if (!document.querySelector('meta[name="theme-color"]')) {
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = "#f8fafc";
  document.head.appendChild(meta);
}
