import type { Radionuclide } from '@/types';

/**
 * Données de référence par radionucléide utilisées en médecine nucléaire.
 *
 * - `halfLifeHours` : demi-vie physique (constante physique fiable).
 * - `clearanceLevelBqPerG` : niveau de libération en activité massique (Bq/g).
 *
 * ⚠️ IMPORTANT — VALEURS RÉGLEMENTAIRES À VALIDER
 * Les niveaux de libération ci-dessous sont INDICATIFS (inspirés des niveaux d'exemption/
 * libération de la Directive 2013/59/Euratom, Annexe VII, tableau A). Ils DOIVENT être vérifiés
 * et validés par la Personne Compétente en Radioprotection (PCR) / le physicien médical au regard
 * de la réglementation nationale (ASN) AVANT tout usage opérationnel. Les demi-vies, elles, sont
 * des constantes physiques fiables.
 */
export interface RadionuclideReference {
  label: Radionuclide;
  halfLifeHours: number;
  clearanceLevelBqPerG: number;
  /** Catégorie d'usage, pour le regroupement dans l'interface. */
  category: 'TEP' | 'TEMP / scintigraphie' | 'Thérapie';
}

export const RADIONUCLIDE_REFERENCE: Record<Exclude<Radionuclide, 'autres'>, RadionuclideReference> = {
  // TEP (PET)
  'F-18': { label: 'F-18', halfLifeHours: 1.8295, clearanceLevelBqPerG: 1e1, category: 'TEP' },
  'Ga-68': { label: 'Ga-68', halfLifeHours: 1.1285, clearanceLevelBqPerG: 1e1, category: 'TEP' },
  'C-11': { label: 'C-11', halfLifeHours: 0.3398, clearanceLevelBqPerG: 1e1, category: 'TEP' },
  // TEMP / scintigraphie
  'Tc-99m': { label: 'Tc-99m', halfLifeHours: 6.0067, clearanceLevelBqPerG: 1e2, category: 'TEMP / scintigraphie' },
  'I-123': { label: 'I-123', halfLifeHours: 13.22, clearanceLevelBqPerG: 1e2, category: 'TEMP / scintigraphie' },
  'In-111': { label: 'In-111', halfLifeHours: 67.31, clearanceLevelBqPerG: 1e2, category: 'TEMP / scintigraphie' },
  'Ga-67': { label: 'Ga-67', halfLifeHours: 78.27, clearanceLevelBqPerG: 1e2, category: 'TEMP / scintigraphie' },
  'Tl-201': { label: 'Tl-201', halfLifeHours: 72.91, clearanceLevelBqPerG: 1e2, category: 'TEMP / scintigraphie' },
  'Cr-51': { label: 'Cr-51', halfLifeHours: 664.4, clearanceLevelBqPerG: 1e3, category: 'TEMP / scintigraphie' },
  // Thérapie
  'I-131': { label: 'I-131', halfLifeHours: 192.6, clearanceLevelBqPerG: 1e2, category: 'Thérapie' },
  'I-125': { label: 'I-125', halfLifeHours: 1425.6, clearanceLevelBqPerG: 1e3, category: 'Thérapie' },
  'Lu-177': { label: 'Lu-177', halfLifeHours: 159.53, clearanceLevelBqPerG: 1e3, category: 'Thérapie' },
  'Y-90': { label: 'Y-90', halfLifeHours: 64.053, clearanceLevelBqPerG: 1e3, category: 'Thérapie' },
  'Sm-153': { label: 'Sm-153', halfLifeHours: 46.28, clearanceLevelBqPerG: 1e3, category: 'Thérapie' },
  'Ra-223': { label: 'Ra-223', halfLifeHours: 274.4, clearanceLevelBqPerG: 1e2, category: 'Thérapie' },
  'Re-186': { label: 'Re-186', halfLifeHours: 89.25, clearanceLevelBqPerG: 1e3, category: 'Thérapie' },
  'Sr-89': { label: 'Sr-89', halfLifeHours: 1212.7, clearanceLevelBqPerG: 1e3, category: 'Thérapie' },
};

/** Règle des « 10 périodes » : nombre minimal de demi-vies avant libération possible. */
export const MIN_HALF_LIVES_FOR_RELEASE = 10;

/**
 * Seuil opérationnel de débit de dose au contact pour autoriser la sortie (µSv/h).
 * Valeur par défaut prudente — À VALIDER par la PCR (souvent proche du bruit de fond).
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

/** Liste ordonnée des radionucléides pour les menus déroulants ('autres' en dernier). */
export const RADIONUCLIDE_OPTIONS: Radionuclide[] = [
  'Tc-99m', 'F-18', 'Ga-68', 'I-123', 'I-131', 'I-125',
  'Lu-177', 'Y-90', 'In-111', 'Ga-67', 'Tl-201', 'Sm-153',
  'Ra-223', 'Re-186', 'Sr-89', 'Cr-51', 'C-11', 'autres',
];
