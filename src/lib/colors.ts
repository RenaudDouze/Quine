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

/** Un accent de grille doit être une couleur hexadécimale à 6 chiffres
 * (#rrggbb) : le seul format que produit le sélecteur de couleurs de
 * CustomizeModal, et le seul que tintWithWhite (gridImage.ts) sait
 * interpréter. Une grille venue d'ailleurs (backup JSON, lien de partage,
 * synchro distante) peut porter n'importe quelle chaîne dans son champ
 * `color` — sans cette validation à l'usage, elle finirait insérée telle
 * quelle dans un attribut SVG (gridImage.ts) ou appliquée comme valeur CSS
 * arbitraire (GridCard.tsx). */
export function isValidHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}
