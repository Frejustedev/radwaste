/**
 * Version de l'application et date de dernière mise à jour.
 * ⚠️ À INCRÉMENTER à chaque déploiement (version sémantique + date AAAA-MM-JJ).
 */
export const APP_VERSION = '1.9.0';
export const APP_LAST_UPDATED = '2026-06-14'; // AAAA-MM-JJ

/** Date de dernière mise à jour formatée en français (JJ/MM/AAAA). */
export function lastUpdatedFr(): string {
  const d = new Date(APP_LAST_UPDATED);
  return Number.isNaN(d.getTime()) ? APP_LAST_UPDATED : d.toLocaleDateString('fr-FR');
}
