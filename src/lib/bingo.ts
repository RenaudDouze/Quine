export interface Cell {
  label: string;
  free: boolean;
  marked: boolean;
}

export interface Grid {
  id: string;
  title: string;
  size: number;
  freeCenter: boolean;
  items: string[];
  cells: Cell[];
  createdAt: number;
  updatedAt: number;
  /** Couleur d'accent de la carte. Absente = couleur du thème par défaut. */
  color?: string;
  /** URL d'une image de fond pour la carte de la grille. Absente = pas d'image. */
  backgroundImageUrl?: string;
  /** Épinglée en tête de liste, devant les grilles non épinglées. Absente = non épinglée. */
  pinned?: boolean;
  /** Grille archivée : masquée de la liste par défaut. Absente = active. */
  archived?: boolean;
}

/** Une grille correspond à une recherche si son titre contient la requête
 * (insensible à la casse). Une requête vide (ou blanche, une fois "trim"ée)
 * correspond à tout par construction : `"...".includes("")` vaut toujours
 * `true`, donc pas besoin d'un cas particulier explicite. */
export function matchesSearch(grid: Grid, query: string): boolean {
  const q = query.trim().toLowerCase();
  return grid.title.toLowerCase().includes(q);
}

/** Fait remonter les grilles épinglées en tête, sans changer l'ordre relatif
 * des grilles entre elles au sein d'un même groupe (tri stable) : une
 * alternative rapide au glisser-déposer pour les grilles qu'on veut garder à
 * portée de main. */
export function sortByPinned(grids: Grid[]): Grid[] {
  return [...grids].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  // Stryker disable next-line EqualityOperator: `i >= 0` is behaviorally
  // identical — at i=0, j is always floor(random*1)=0 too, so the extra
  // iteration is always a self-swap no-op. `i > 0` just skips that no-op.
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isOddSize(size: number): boolean {
  return size % 2 === 1;
}

export function neededCount(size: number, freeCenter: boolean): number {
  const total = size * size;
  const useFree = freeCenter && isOddSize(size);
  return useFree ? total - 1 : total;
}

export function buildCells(items: string[], size: number, freeCenter: boolean): Cell[] {
  const total = size * size;
  const useFree = freeCenter && isOddSize(size);
  const center = Math.floor(total / 2);

  const pool = shuffle(items);
  const cells: Cell[] = [];
  let poolIdx = 0;
  for (let i = 0; i < total; i++) {
    if (useFree && i === center) {
      cells.push({ label: "GRATUIT", free: true, marked: true });
    } else {
      cells.push({ label: pool[poolIdx++], free: false, marked: false });
    }
  }
  return cells;
}

export interface WinResult {
  hasWin: boolean;
  winSet: Set<number>;
}

export function checkWin(cells: Cell[], size: number): WinResult {
  const marked = (i: number) => cells[i].marked;
  const winSet = new Set<number>();
  let hasWin = false;

  for (let r = 0; r < size; r++) {
    const idxs: number[] = [];
    for (let c = 0; c < size; c++) idxs.push(r * size + c);
    if (idxs.every(marked)) {
      hasWin = true;
      idxs.forEach((i) => winSet.add(i));
    }
  }

  for (let c = 0; c < size; c++) {
    const idxs: number[] = [];
    for (let r = 0; r < size; r++) idxs.push(r * size + c);
    if (idxs.every(marked)) {
      hasWin = true;
      idxs.forEach((i) => winSet.add(i));
    }
  }

  const d1: number[] = [];
  const d2: number[] = [];
  for (let i = 0; i < size; i++) {
    d1.push(i * size + i);
    d2.push(i * size + (size - 1 - i));
  }
  if (d1.every(marked)) {
    hasWin = true;
    d1.forEach((i) => winSet.add(i));
  }
  if (d2.every(marked)) {
    hasWin = true;
    d2.forEach((i) => winSet.add(i));
  }

  return { hasWin, winSet };
}
