/** N'imprime que la grille visée (identifiée par son id) : toutes les
 * grilles de la liste partagent la même page (voir @media print dans
 * index.css), donc window.print() sans cette marque imprimerait toute la
 * liste plutôt que la seule grille demandée. */
export function printGrid(gridId: string) {
  const el = document.querySelector(`[data-grid-id="${gridId}"]`);
  el?.setAttribute("data-printing", "true");
  const cleanup = () => el?.removeAttribute("data-printing");
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
}
