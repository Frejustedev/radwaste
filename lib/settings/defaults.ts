import type { AppSettings } from '@/types';

/** Valeurs par défaut des listes paramétrables (utilisées tant que l'admin n'a rien personnalisé). */
export const DEFAULT_ORIGIN_SERVICES = [
  'Labo chaud',
  'Salle d’injection',
  'Salle d’attente chaude',
  'Salle d’acquisition',
  'Salle de consultation chaude',
  'Salle d’interprétation',
];

export const DEFAULT_WASTE_TYPES = [
  'solide', 'liquide', 'biologique', 'seringue', 'flacon', 'tubulure', 'gants', 'compresses', 'autres',
];

export const DEFAULT_ELIMINATION_MODES = [
  'Filière agréée', 'Incinérateur classique', 'Déchets standards', 'Autre',
];

export const DEFAULT_INCIDENT_TYPES = [
  'Déversement accidentel', 'Contamination', 'Perte de déchet',
];

/** Construit un AppSettings complet en comblant les listes absentes/vides par les valeurs par défaut. */
export function withDefaults(hospitalId: string, partial?: Partial<AppSettings> | null): AppSettings {
  const nonEmpty = (a: unknown, fallback: string[]) =>
    Array.isArray(a) && a.length > 0 ? (a as string[]) : fallback;
  return {
    hospitalId,
    originServices: nonEmpty(partial?.originServices, DEFAULT_ORIGIN_SERVICES),
    wasteTypes: nonEmpty(partial?.wasteTypes, DEFAULT_WASTE_TYPES),
    eliminationModes: nonEmpty(partial?.eliminationModes, DEFAULT_ELIMINATION_MODES),
    incidentTypes: nonEmpty(partial?.incidentTypes, DEFAULT_INCIDENT_TYPES),
  };
}
