/** Valide qu'une chaîne est une URL http(s), seule utilisable comme image de fond. */
export function isValidImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
