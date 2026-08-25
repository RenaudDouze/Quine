import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { triggerDownload } from "./download";

describe("triggerDownload", () => {
  let createElementSpy: ReturnType<typeof vi.spyOn>;
  let clickSpy: ReturnType<typeof vi.fn<() => void>>;
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let lastAnchor: HTMLAnchorElement | null;

  beforeEach(() => {
    clickSpy = vi.fn();
    lastAnchor = null;
    const originalCreateElement = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") {
        const anchor = el as HTMLAnchorElement;
        anchor.click = clickSpy;
        lastAnchor = anchor;
      }
      return el;
    });
    createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    createElementSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it("crée une URL objet à partir du blob fourni", () => {
    const blob = new Blob(["contenu"], { type: "text/plain" });
    triggerDownload(blob, "fichier.txt");
    expect(createObjectURLSpy).toHaveBeenCalledWith(blob);
  });

  it("déclenche le téléchargement avec le nom de fichier donné", () => {
    triggerDownload(new Blob(["x"]), "mon-fichier.svg");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(lastAnchor?.download).toBe("mon-fichier.svg");
  });

  it("pointe le lien vers l'URL objet créée", () => {
    triggerDownload(new Blob(["x"]), "fichier.txt");
    expect(lastAnchor?.href).toBe("blob:mock-url");
  });

  it("révoque l'URL objet après le téléchargement", () => {
    triggerDownload(new Blob(["x"]), "fichier.txt");
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url");
  });

  it("attache le lien au document avant de déclencher le téléchargement, puis le retire", () => {
    const appendChildSpy = vi.spyOn(document.body, "appendChild");
    triggerDownload(new Blob(["x"]), "fichier.txt");
    expect(appendChildSpy).toHaveBeenCalledWith(lastAnchor);
    expect(lastAnchor?.isConnected).toBe(false);
    appendChildSpy.mockRestore();
  });
});
