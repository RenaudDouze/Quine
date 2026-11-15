import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSystemDarkMode } from "./useSystemDarkMode";

class FakeMediaQueryList {
  matches: boolean;
  media: string;
  private listeners = new Set<(e: MediaQueryListEvent) => void>();

  constructor(media: string, matches: boolean) {
    this.media = media;
    this.matches = matches;
  }

  addedTypes: string[] = [];
  removedTypes: string[] = [];

  addEventListener(type: string, handler: (e: MediaQueryListEvent) => void) {
    this.addedTypes.push(type);
    this.listeners.add(handler);
  }

  removeEventListener(type: string, handler: (e: MediaQueryListEvent) => void) {
    this.removedTypes.push(type);
    this.listeners.delete(handler);
  }

  emit(matches: boolean) {
    this.matches = matches;
    for (const listener of this.listeners) {
      listener({ matches } as MediaQueryListEvent);
    }
  }

  get listenerCount() {
    return this.listeners.size;
  }
}

describe("useSystemDarkMode", () => {
  let mql: FakeMediaQueryList;
  let matchMediaSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mql = new FakeMediaQueryList("(prefers-color-scheme: dark)", false);
    matchMediaSpy = vi.spyOn(window, "matchMedia").mockImplementation(() => mql as unknown as MediaQueryList);
  });

  afterEach(() => {
    matchMediaSpy.mockRestore();
  });

  it("retourne false quand le système est en thème clair au montage", () => {
    const { result } = renderHook(() => useSystemDarkMode());
    expect(result.current).toBe(false);
  });

  it("retourne true quand le système est en thème sombre au montage", () => {
    mql = new FakeMediaQueryList("(prefers-color-scheme: dark)", true);
    matchMediaSpy.mockImplementation(() => mql as unknown as MediaQueryList);
    const { result } = renderHook(() => useSystemDarkMode());
    expect(result.current).toBe(true);
  });

  it("se met à jour quand la préférence système change", () => {
    const { result } = renderHook(() => useSystemDarkMode());
    expect(result.current).toBe(false);
    act(() => {
      mql.emit(true);
    });
    expect(result.current).toBe(true);
  });

  it("se désabonne au démontage", () => {
    const { unmount } = renderHook(() => useSystemDarkMode());
    expect(mql.listenerCount).toBe(1);
    unmount();
    expect(mql.listenerCount).toBe(0);
  });

  it("interroge la requête sombre et écoute l'évènement « change »", () => {
    const { unmount } = renderHook(() => useSystemDarkMode());
    expect(matchMediaSpy).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    expect(mql.addedTypes).toEqual(["change"]);
    unmount();
    expect(mql.removedTypes).toEqual(["change"]);
  });
});
