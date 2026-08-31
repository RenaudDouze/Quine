// Alphabet volontairement privé des caractères ambigus à l'oral/à l'écran
// (0/O, 1/I/L, U/V) : un code se lit et se retape à la main sur un autre
// appareil, la moindre confusion oblige à tout recommencer.
const ALPHABET = "ABCDEFGHJKMNPQRSTWXYZ23456789";
const CODE_LENGTH = 8;

/** Génère un code de synchronisation aléatoire (8 caractères, sans tiret). */
export function generateSyncCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

/** Met un code saisi à la main (espaces, tirets, minuscules) au format
 * canonique utilisé comme clé de stockage. */
export function normalizeSyncCode(raw: string): string {
  // Un remplacement global retire déjà les espaces/tirets en tête et en
  // queue : un `.trim()` préalable n'apporterait rien d'observable.
  return raw.toUpperCase().replace(/[\s-]/g, "");
}

/** Un code normalisé valide fait exactement 8 caractères de l'alphabet
 * autorisé (après normalisation, donc lettres majuscules et chiffres). */
export function isValidSyncCode(code: string): boolean {
  return new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`).test(code);
}
