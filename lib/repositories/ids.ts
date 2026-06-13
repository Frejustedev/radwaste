/**
 * Génère un numéro de registre lisible et pratiquement sans collision.
 * Format : PREFIX-CODE-AAMMJJ-XXXX (suffixe aléatoire). L'identifiant technique du document
 * (clé Firestore) reste, lui, garanti unique — voir les repositories.
 */
export function makeRegistryNumber(prefix: string, code: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${code}-${stamp}-${rand}`;
}
