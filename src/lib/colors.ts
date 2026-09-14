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

/** Décompose une couleur hexadécimale #rrggbb en triplet RGB (0-255 par
 * canal) — utilisé partout où une couleur d'accent doit être posée sur un
 * support qui ne comprend pas le CSS (export PDF via jsPDF, voir
 * pdfExport.ts). Suppose une entrée déjà validée par isValidHexColor : les
 * appelants sont responsables de ce garde-fou, comme pour tintWithWhite
 * (gridImage.ts) qui partage ce même calcul. */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
