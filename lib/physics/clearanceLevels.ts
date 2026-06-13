import type { Radionuclide } from '@/types';

/**
 * Données de référence par radionucléide utilisées en médecine nucléaire.
 *
 * - `halfLifeHours` : demi-vie physique (constante physique, fiable).
 * - `clearanceLevelBqPerG` : niveau de libération en activité massique (Bq/g).
 *
 * ⚠️ IMPORTANT — VALEURS RÉGLEMENTAIRES À VALIDER
 * Les niveaux de libération ci-dessous sont des valeurs INDICATIVES inspirées des
 * niveaux d'exemption/libération de la Directive 2013/59/Euratom (Annexe VII, tableau A).
 * Ils DOIVENT être vérifiés et validés par la Personne Compétente en Radioprotection (PCR)
 * et/ou le physicien médical au regard de la réglementation nationale en vigueur (ASN, arrêtés
 * applicables) AVANT tout usage opérationnel réel. Ne pas se fier à ces valeurs telles quelles.
 */
export interface RadionuclideReference {
  label: Radionuclide;
  halfLifeHours: number;
  clearanceLevelBqPerG: number;
}

export const RADIONUCLIDE_REFERENCE: Record<Exclude<Radionuclide, 'autres'>, RadionuclideReference> = {
  'Tc-99m': { label: 'Tc-99m', halfLifeHours: 6.0067, clearanceLevelBqPerG: 1e2 },
  'I-131': { label: 'I-131', halfLifeHours: 192.6, clearanceLevelBqPerG: 1e2 },
  'F-18': { label: 'F-18', halfLifeHours: 1.8295, clearanceLevelBqPerG: 1e1 },
  'Lu-177': { label: 'Lu-177', halfLifeHours: 159.53, clearanceLevelBqPerG: 1e3 },
  'Ga-68': { label: 'Ga-68', halfLifeHours: 1.1285, clearanceLevelBqPerG: 1e1 },
  'Y-90': { label: 'Y-90', halfLifeHours: 64.053, clearanceLevelBqPerG: 1e3 },
};

/**
 * Nombre minimal de périodes (demi-vies) avant libération possible (règle des « 10 périodes »).
 * Pratique courante de décroissance sur place en médecine nucléaire.
 */
export const MIN_HALF_LIVES_FOR_RELEASE = 10;

/**
 * Seuil opérationnel de débit de dose au contact pour autoriser la sortie (µSv/h).
 * Valeur par défaut prudente — À VALIDER par la PCR (souvent défini comme proche du bruit de fond).
 */
export const EXIT_DOSE_RATE_THRESHOLD_USV_H = 0.5;

/** Demi-vie de référence (heures) ou null si inconnue (radionucléide « autres »). */
export function referenceHalfLife(radionuclide: Radionuclide): number | null {
  if (radionuclide === 'autres') return null;
  return RADIONUCLIDE_REFERENCE[radionuclide]?.halfLifeHours ?? null;
}

/** Niveau de libération de référence (Bq/g) ou null si inconnu. */
export function referenceClearanceLevel(radionuclide: Radionuclide): number | null {
  if (radionuclide === 'autres') return null;
  return RADIONUCLIDE_REFERENCE[radionuclide]?.clearanceLevelBqPerG ?? null;
}

export const RADIONUCLIDE_OPTIONS: Radionuclide[] = ['Tc-99m', 'I-131', 'F-18', 'Lu-177', 'Ga-68', 'Y-90', 'autres'];
