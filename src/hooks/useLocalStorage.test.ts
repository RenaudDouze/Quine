import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocalStorage } from "./useLocalStorage";

describe("useLocalStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("utilise la valeur initiale quand rien n'est stocké", () => {
    const { result } = renderHook(() => useLocalStorage("clé-test", "défaut"));
    expect(result.current[0]).toBe("défaut");
  });

  it("lit la valeur déjà stockée au montage", () => {
    window.localStorage.setItem("clé-test", JSON.stringify("valeur-stockée"));
    const { result } = renderHook(() => useLocalStorage("clé-test", "défaut"));
    expect(result.current[0]).toBe("valeur-stockée");
  });

  it("retombe sur la valeur initiale si le contenu stocké est un JSON invalide", () => {
    window.localStorage.setItem("clé-test", "{invalide");
    const { result } = renderHook(() => useLocalStorage("clé-test", "défaut"));
    expect(result.current[0]).toBe("défaut");
  });

  it("persiste la nouvelle valeur dans localStorage", () => {
    const { result } = renderHook(() => useLocalStorage("clé-test", "défaut"));
    act(() => {
      result.current[1]("nouvelle-valeur");
    });
    expect(result.current[0]).toBe("nouvelle-valeur");
    expect(window.localStorage.getItem("clé-test")).toBe(JSON.stringify("nouvelle-valeur"));
  });

  it("accepte une fonction de mise à jour comme setState classique", () => {
    const { result } = renderHook(() => useLocalStorage<number>("compteur-test", 0));
    act(() => {
      result.current[1]((prev) => prev + 1);
    });
    expect(result.current[0]).toBe(1);
  });

  describe("quand window.localStorage lève une exception", () => {
    let getItemSpy: ReturnType<typeof vi.spyOn>;
    let setItemSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      getItemSpy = vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
        throw new Error("stockage indisponible");
      });
      setItemSpy = vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
        throw new Error("quota dépassé");
      });
    });

    afterEach(() => {
      getItemSpy.mockRestore();
      setItemSpy.mockRestore();
    });

    it("retombe sur la valeur initiale si la lecture échoue", () => {
      const { result } = renderHook(() => useLocalStorage("clé-test", "défaut"));
      expect(result.current[0]).toBe("défaut");
    });

    it("n'explose pas si l'écriture échoue", () => {
      const { result } = renderHook(() => useLocalStorage("clé-test", "défaut"));
      expect(() => {
        act(() => {
          result.current[1]("nouvelle-valeur");
        });
      }).not.toThrow();
      expect(result.current[0]).toBe("nouvelle-valeur");
    });
  });
});
