import { describe, expect, it } from "vitest";
import { COLORS, pickColor } from "./colors";

describe("COLORS", () => {
  it("contient exactement la palette curatée attendue", () => {
    // Valeurs littérales (pas de comparaison avec COLORS lui-même) pour
    // détecter une couleur altérée par erreur.
    expect(COLORS).toEqual([
      "#2563eb",
      "#7c3aed",
      "#0d9488",
      "#db2777",
      "#16a34a",
      "#4f46e5",
      "#0891b2",
      "#9333ea",
    ]);
  });
});

describe("pickColor", () => {
  it("retourne la première couleur pour 0 grille existante", () => {
    expect(pickColor(0)).toBe("#2563eb");
  });

  it("retourne la deuxième couleur pour 1 grille existante", () => {
    expect(pickColor(1)).toBe("#7c3aed");
  });

  it("retourne la dernière couleur juste avant de boucler", () => {
    expect(pickColor(COLORS.length - 1)).toBe("#9333ea");
  });

  it("boucle sur la première couleur une fois la palette épuisée", () => {
    expect(pickColor(COLORS.length)).toBe("#2563eb");
  });

  it("boucle correctement après plusieurs tours complets", () => {
    expect(pickColor(COLORS.length * 3 + 2)).toBe("#0d9488");
  });
});
