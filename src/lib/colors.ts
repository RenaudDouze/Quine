/** Palette curatée pour les grilles (évite les couleurs par défaut génériques). */
export const COLORS = [
  "#2563eb", // bleu
  "#7c3aed", // violet
  "#0d9488", // sarcelle
  "#db2777", // fuchsia
  "#16a34a", // vert
  "#4f46e5", // indigo
  "#0891b2", // cyan
  "#9333ea", // pourpre
];

/** Choisit la prochaine couleur de la palette, en boucle, selon le nombre de grilles existantes. */
export function pickColor(existingCount: number): string {
  return COLORS[existingCount % COLORS.length];
}
