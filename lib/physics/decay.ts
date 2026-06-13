import type { WasteItem } from '@/types';
import {
  referenceClearanceLevel,
  MIN_HALF_LIVES_FOR_RELEASE,
  EXIT_DOSE_RATE_THRESHOLD_USV_H,
} from './clearanceLevels';

const MS_PER_HOUR = 3_600_000;
const BQ_PER_MBQ = 1e6;

/** Heures écoulées entre `measureDate` et `now`. Null si la date est invalide. */
export function elapsedHours(measureDateIso: string, now: Date = new Date()): number | null {
  const measure = new Date(measureDateIso).getTime();
  if (Number.isNaN(measure)) return null;
  const hours = (now.getTime() - measure) / MS_PER_HOUR;
  return Math.max(0, hours);
}

/** Activité résiduelle en MBq selon la loi de décroissance A = A0 · 0.5^(t/T½). Null si données invalides. */
export function residualActivityMBq(item: Pick<WasteItem, 'initialActivity' | 'measureDate' | 'halfLife'>, now: Date = new Date()): number | null {
  const hours = elapsedHours(item.measureDate, now);
  if (hours === null) return null;
  if (!(item.halfLife > 0) || !(item.initialActivity >= 0)) return null;
  const halfLives = hours / item.halfLife;
  return item.initialActivity * Math.pow(0.5, halfLives);
}

/** Pourcentage de décroissance (0–100). Null si données invalides. */
export function decayPercentage(item: Pick<WasteItem, 'initialActivity' | 'measureDate' | 'halfLife'>, now: Date = new Date()): number | null {
  const hours = elapsedHours(item.measureDate, now);
  if (hours === null || !(item.halfLife > 0)) return null;
  const halfLives = hours / item.halfLife;
  return Math.min(100, (1 - Math.pow(0.5, halfLives)) * 100);
}

/** Nombre de périodes (demi-vies) écoulées depuis la mesure. Null si données invalides. */
export function halfLivesElapsed(item: Pick<WasteItem, 'measureDate' | 'halfLife'>, now: Date = new Date()): number | null {
  const hours = elapsedHours(item.measureDate, now);
  if (hours === null || !(item.halfLife > 0)) return null;
  return hours / item.halfLife;
}

/** Activité massique résiduelle en Bq/g. Null si masse absente/invalide ou activité incalculable. */
export function massicActivityBqPerG(item: Pick<WasteItem, 'initialActivity' | 'measureDate' | 'halfLife' | 'mass'>, now: Date = new Date()): number | null {
  const residualMBq = residualActivityMBq(item, now);
  if (residualMBq === null) return null;
  if (!(item.mass > 0)) return null;
  return (residualMBq * BQ_PER_MBQ) / item.mass;
}

/** Niveau de libération applicable (Bq/g) : override de l'item sinon table de référence. Null si inconnu. */
export function applicableClearanceLevel(item: Pick<WasteItem, 'radionuclide' | 'clearanceLevelBqPerG'>): number | null {
  if (typeof item.clearanceLevelBqPerG === 'number' && item.clearanceLevelBqPerG > 0) {
    return item.clearanceLevelBqPerG;
  }
  return referenceClearanceLevel(item.radionuclide);
}

/** Date théorique à laquelle l'activité massique passe sous le seuil de libération. Null si incalculable. */
export function theoreticalReleaseDate(item: Pick<WasteItem, 'initialActivity' | 'measureDate' | 'halfLife' | 'mass' | 'radionuclide' | 'clearanceLevelBqPerG'>): Date | null {
  const measure = new Date(item.measureDate).getTime();
  if (Number.isNaN(measure) || !(item.halfLife > 0) || !(item.mass > 0) || !(item.initialActivity > 0)) return null;
  const clearance = applicableClearanceLevel(item);
  if (clearance === null || !(clearance > 0)) return null;

  const initialMassicBqPerG = (item.initialActivity * BQ_PER_MBQ) / item.mass;
  if (initialMassicBqPerG <= clearance) return new Date(measure);

  // t = T½ · log0.5(clearance / initialMassic)
  const hoursNeeded = item.halfLife * (Math.log(clearance / initialMassicBqPerG) / Math.log(0.5));
  return new Date(measure + hoursNeeded * MS_PER_HOUR);
}

export interface DecayEvaluation {
  residualMBq: number | null;
  massicBqPerG: number | null;
  decayPct: number | null;
  halfLives: number | null;
  clearanceLevelBqPerG: number | null;
  releaseDate: Date | null;
  meetsMassicCriterion: boolean;
  meetsTenHalfLivesCriterion: boolean;
  /** Critères de stockage réunis (massique + ≥ 10 périodes). Le contrôle du débit de dose se fait à la sortie. */
  meetsStorageReleaseCriteria: boolean;
  blockingReasons: string[];
}

/** Évalue les critères de passage au statut « libérable » (hors contrôle de débit de dose à la sortie). */
export function evaluateDecay(item: WasteItem, now: Date = new Date()): DecayEvaluation {
  const residualMBq = residualActivityMBq(item, now);
  const massicBqPerG = massicActivityBqPerG(item, now);
  const decayPct = decayPercentage(item, now);
  const halfLives = halfLivesElapsed(item, now);
  const clearance = applicableClearanceLevel(item);
  const releaseDate = theoreticalReleaseDate(item);
  const reasons: string[] = [];

  const meetsMassicCriterion = massicBqPerG !== null && clearance !== null && massicBqPerG <= clearance;
  if (massicBqPerG === null) reasons.push('Activité massique incalculable (masse manquante ou données invalides).');
  if (clearance === null) reasons.push('Niveau de libération inconnu pour ce radionucléide (à renseigner).');
  if (massicBqPerG !== null && clearance !== null && massicBqPerG > clearance) {
    reasons.push('Activité massique résiduelle au-dessus du seuil de libération.');
  }

  const meetsTenHalfLivesCriterion = halfLives !== null && halfLives >= MIN_HALF_LIVES_FOR_RELEASE;
  if (halfLives === null) reasons.push('Nombre de périodes écoulées incalculable.');
  else if (halfLives < MIN_HALF_LIVES_FOR_RELEASE) {
    reasons.push(`Moins de ${MIN_HALF_LIVES_FOR_RELEASE} périodes écoulées (${halfLives.toFixed(1)}).`);
  }

  return {
    residualMBq,
    massicBqPerG,
    decayPct,
    halfLives,
    clearanceLevelBqPerG: clearance,
    releaseDate,
    meetsMassicCriterion,
    meetsTenHalfLivesCriterion,
    meetsStorageReleaseCriteria: meetsMassicCriterion && meetsTenHalfLivesCriterion,
    blockingReasons: reasons,
  };
}

export interface ExitControlEvaluation {
  meetsDoseRateCriterion: boolean;
  meetsAllCriteria: boolean;
  blockingReasons: string[];
}

/**
 * Évalue le contrôle de sortie : combine les critères de stockage (massique + 10 périodes)
 * avec la mesure du débit de dose au contact (≤ seuil opérationnel).
 */
export function evaluateExitControl(
  item: WasteItem,
  exitDoseRate: number,
  now: Date = new Date(),
  doseThreshold: number = EXIT_DOSE_RATE_THRESHOLD_USV_H,
): ExitControlEvaluation {
  const decay = evaluateDecay(item, now);
  const reasons = [...decay.blockingReasons];

  const meetsDoseRateCriterion = Number.isFinite(exitDoseRate) && exitDoseRate >= 0 && exitDoseRate <= doseThreshold;
  if (!Number.isFinite(exitDoseRate) || exitDoseRate < 0) {
    reasons.push('Débit de dose de sortie non mesuré ou invalide.');
  } else if (exitDoseRate > doseThreshold) {
    reasons.push(`Débit de dose au contact (${exitDoseRate} µSv/h) au-dessus du seuil (${doseThreshold} µSv/h).`);
  }

  return {
    meetsDoseRateCriterion,
    meetsAllCriteria: decay.meetsStorageReleaseCriteria && meetsDoseRateCriterion,
    blockingReasons: reasons,
  };
}
