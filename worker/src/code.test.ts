import { describe, expect, it } from "vitest";
import { generateSyncCode, isValidSyncCode, normalizeSyncCode } from "./code";

describe("generateSyncCode", () => {
  it("génère un code de 8 caractères", () => {
    expect(generateSyncCode()).toHaveLength(8);
  });

  it("n'utilise que des caractères sans ambiguïté visuelle", () => {
    const code = generateSyncCode();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTWXYZ23456789]{8}$/);
  });

  it("ne produit jamais deux fois exactement le même code sur un grand échantillon", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateSyncCode()));
    expect(codes.size).toBe(500);
  });
});

describe("normalizeSyncCode", () => {
  it("met en majuscules", () => {
    expect(normalizeSyncCode("abcdefgh")).toBe("ABCDEFGH");
  });

  it("retire les tirets", () => {
    expect(normalizeSyncCode("ABCD-EFGH")).toBe("ABCDEFGH");
  });

  it("retire les espaces", () => {
    expect(normalizeSyncCode("  ABCD EFGH  ")).toBe("ABCDEFGH");
  });

  it("gère plusieurs tirets/espaces consécutifs", () => {
    expect(normalizeSyncCode("ABCD--  EFGH")).toBe("ABCDEFGH");
  });
});

describe("isValidSyncCode", () => {
  it("accepte un code généré", () => {
    expect(isValidSyncCode(generateSyncCode())).toBe(true);
  });

  it("refuse un code trop court", () => {
    expect(isValidSyncCode("ABCDEFG")).toBe(false);
  });

  it("refuse un code trop long", () => {
    expect(isValidSyncCode("ABCDEFGHJ")).toBe(false);
  });

  it("refuse un caractère ambigu exclu de l'alphabet (ex: O)", () => {
    expect(isValidSyncCode("ABCDEFGO")).toBe(false);
  });

  it("refuse des minuscules non normalisées", () => {
    expect(isValidSyncCode("abcdefgh")).toBe(false);
  });

  it("refuse une chaîne vide", () => {
    expect(isValidSyncCode("")).toBe(false);
  });
});
