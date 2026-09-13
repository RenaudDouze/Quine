// Alphabet volontairement privé des caractères ambigus à l'oral/à l'écran
// (0/O, 1/I/L, U/V) : un code se lit et se retape à la main sur un autre
// appareil, la moindre confusion oblige à tout recommencer.
const ALPHABET = "ABCDEFGHJKMNPQRSTWXYZ23456789";
const CODE_LENGTH = 8;
// Plus grand multiple de la taille de l'alphabet (29) qui tient dans un octet
// (256) : un octet tiré au-delà de cette limite est rejeté et retiré, pour
// que chaque caractère ait exactement la même probabilité — un simple modulo
// (octet % 29) biaiserait légèrement les premiers caractères de l'alphabet,
// 256 n'étant pas un multiple de 29.
const REJECTION_LIMIT = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

/** Génère un code de synchronisation aléatoire (8 caractères, sans tiret).
 * `crypto.getRandomValues` (CSPRNG) plutôt que `Math.random()` : ce code est
 * la seule barrière d'accès en lecture/écriture aux grilles synchronisées
 * (pas de compte, voir README.md) — `Math.random()` n'offre aucune garantie
 * d'imprévisibilité cryptographique, contrairement à l'API Web Crypto,
 * disponible nativement dans le runtime Workers. */
export function generateSyncCode(): string {
  let code = "";
  const byte = new Uint8Array(1);
  while (code.length < CODE_LENGTH) {
    crypto.getRandomValues(byte);
    if (byte[0] >= REJECTION_LIMIT) continue;
    code += ALPHABET[byte[0] % ALPHABET.length];
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
