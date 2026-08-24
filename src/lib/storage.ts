import type { Grid } from "./bingo";

const STORAGE_KEY = "bingo.grids.v1";

export function loadGrids(): Grid[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Grid[]) : [];
  } catch {
    return [];
  }
}

export function saveGrids(grids: Grid[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(grids));
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
