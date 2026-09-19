/** Fusionne un nouvel ordre — portant sur `newOrder`, un sous-ensemble
 * visible de `prev` potentiellement filtré (recherche, vue Actives/Archivées,
 * tri par épinglées) — dans la liste complète : les éléments absents de
 * `newOrder` (masqués par le filtre courant) gardent leur position, seuls les
 * éléments visibles changent de place entre eux (chacun réoccupe
 * l'emplacement d'un autre élément visible). Comme dans +1 (`reorder.ts`),
 * dont c'est ici la même logique : le glisser-déposer et son équivalent
 * clavier (Monter/Descendre) de HomeView portent tous deux sur `sortedGrids`
 * (filtré puis trié par épinglées), jamais directement sur la liste complète
 * des grilles. */
export function mergeVisibleOrder<T extends { id: string }>(prev: T[], newOrder: T[]): T[] {
  const visibleIds = new Set(newOrder.map((item) => item.id));
  const slots: number[] = [];
  prev.forEach((item, i) => {
    if (visibleIds.has(item.id)) slots.push(i);
  });
  const next = [...prev];
  slots.forEach((slot, k) => {
    next[slot] = newOrder[k];
  });
  return next;
}
