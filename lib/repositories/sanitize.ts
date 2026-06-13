/**
 * Retire les clés dont la valeur est `undefined` (Firestore rejette les valeurs `undefined`).
 * Permet d'enregistrer des documents avec des champs laissés vides (à compléter plus tard).
 */
export function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}
