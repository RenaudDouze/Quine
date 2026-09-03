import { describe, expect, it } from "vitest";
import { COLORS, isValidHexColor, pickColor } from "./colors";

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

describe("isValidHexColor", () => {
  it("accepte une couleur hexadécimale à 6 chiffres en minuscules", () => {
    expect(isValidHexColor("#2563eb")).toBe(true);
  });

  it("accepte une couleur hexadécimale à 6 chiffres en majuscules", () => {
    expect(isValidHexColor("#2563EB")).toBe(true);
  });

  it("refuse une chaîne sans #", () => {
    expect(isValidHexColor("2563eb")).toBe(false);
  });

  it("refuse une couleur à 3 chiffres", () => {
    expect(isValidHexColor("#25e")).toBe(false);
  });

  it("refuse une chaîne trop longue même si elle commence par un hex valide", () => {
    expect(isValidHexColor("#2563eb00")).toBe(false);
  });

  it("refuse un mot-clé CSS", () => {
    expect(isValidHexColor("red")).toBe(false);
  });

  it('refuse une valeur conçue pour casser hors d\'un attribut ("<couleur>")', () => {
    expect(isValidHexColor('#2563eb" onload="alert(1)')).toBe(false);
  });

  it("refuse une chaîne vide", () => {
    expect(isValidHexColor("")).toBe(false);
  });

  it("refuse un hex valide précédé d'autre chose (ancré en début de chaîne)", () => {
    expect(isValidHexColor("x#2563eb")).toBe(false);
  });
});
