import { describe, expect, it } from "vitest";
import { isValidImageUrl } from "./url";

describe("isValidImageUrl", () => {
  it("accepte une URL http", () => {
    expect(isValidImageUrl("http://example.com/image.jpg")).toBe(true);
  });

  it("accepte une URL https", () => {
    expect(isValidImageUrl("https://example.com/image.jpg")).toBe(true);
  });

  it("refuse un protocole non http(s) (ex: javascript:)", () => {
    expect(isValidImageUrl("javascript:alert(1)")).toBe(false);
  });

  it("refuse un protocole data:", () => {
    expect(isValidImageUrl("data:image/png;base64,abcd")).toBe(false);
  });

  it("refuse un protocole file:", () => {
    expect(isValidImageUrl("file:///etc/passwd")).toBe(false);
  });

  it("refuse une chaîne qui n'est pas une URL valide", () => {
    expect(isValidImageUrl("pas une url")).toBe(false);
  });

  it("refuse une chaîne vide", () => {
    expect(isValidImageUrl("")).toBe(false);
  });
});
