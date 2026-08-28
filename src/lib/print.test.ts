import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printGrid } from "./print";

describe("printGrid", () => {
  let printSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    document.body.innerHTML = "";
  });

  afterEach(() => {
    printSpy.mockRestore();
    document.body.innerHTML = "";
  });

  it("marks the matching grid element as printing before calling window.print", () => {
    document.body.innerHTML = '<div data-grid-id="g1"></div>';
    const el = document.querySelector('[data-grid-id="g1"]')!;

    printGrid("g1");

    expect(el.getAttribute("data-printing")).toBe("true");
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it("does not mark an unrelated grid element", () => {
    document.body.innerHTML = '<div data-grid-id="g1"></div><div data-grid-id="g2"></div>';

    printGrid("g1");

    expect(document.querySelector('[data-grid-id="g2"]')!.hasAttribute("data-printing")).toBe(false);
  });

  it("clears the mark once printing finishes (afterprint)", () => {
    document.body.innerHTML = '<div data-grid-id="g1"></div>';
    const el = document.querySelector('[data-grid-id="g1"]')!;

    printGrid("g1");
    expect(el.getAttribute("data-printing")).toBe("true");

    window.dispatchEvent(new Event("afterprint"));
    expect(el.hasAttribute("data-printing")).toBe(false);
  });

  it("does nothing but still print when no element matches the given id", () => {
    expect(() => printGrid("missing")).not.toThrow();
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it("registers the afterprint cleanup as a one-time listener", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    document.body.innerHTML = '<div data-grid-id="g1"></div>';

    printGrid("g1");

    expect(addEventListenerSpy).toHaveBeenCalledWith("afterprint", expect.any(Function), {
      once: true,
    });
    addEventListenerSpy.mockRestore();
  });
});
