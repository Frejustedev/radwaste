import type { WasteItem } from '@/types';
import {
  referenceClearanceLevel,
  MIN_HALF_LIVES_FOR_RELEASE,
  EXIT_DOSE_RATE_THRESHOLD_USV_H,
} from './clearanceLevels';

const MS_PER_HOUR = 3_600_000;
const BQ_PER_MBQ = 1e6;

/** Heures écoulées entre `measureDate` et `now`. Null si la date est absente ou invalide. */
export function elapsedHours(measureDateIso: string | undefined, now: Date = new Date()): number | null {
  if (!measureDateIso) return null;
  const measure = new Date(measureDateIso).getTime();
  if (Number.isNaN(measure)) return null;
  return Math.max(0, (now.getTime() - measure) / MS_PER_HOUR);
}

type DecayInput = Pick<WasteItem, 'initialActivity' | 'measureDate' | 'halfLife'>;

/** Activité résiduelle en MBq selon A = A0 · 0.5^(t/T½). Null si données manquantes/invalides. */
export function residualActivityMBq(item: DecayInput, now: Date = new Date()): number | null {
  const { initialActivity, halfLife } = item;
  if (typeof initialActivity !== 'number' || initialActivity < 0) return null;
  if (typeof halfLife !== 'number' || halfLife <= 0) return null;
  const hours = elapsedHours(item.measureDate, now);
  if (hours === null) return null;
  return initialActivity * Math.pow(0.5, hours / halfLife);
}

/** Pourcentage de décroissance (0–100). Null si données manquantes/invalides. */
export function decayPercentage(item: DecayInput, now: Date = new Date()): number | null {
  const { halfLife } = item;
  if (typeof halfLife !== 'number' || halfLife <= 0) return null;
  const hours = elapsedHours(item.measureDate, now);
  if (hours === null) return null;
  return Math.min(100, (1 - Math.pow(0.5, hours / halfLife)) * 100);
}

/** Nombre de périodes (demi-vies) écoulées. Null si données manquantes/invalides. */
export function halfLivesElapsed(item: Pick<WasteItem, 'measureDate' | 'halfLife'>, now: Date = new Date()): number | null {
  const { halfLife } = item;
  if (typeof halfLife !== 'number' || halfLife <= 0) return null;
  const hours = elapsedHours(item.measureDate, now);
  if (hours === null) return null;
  return hours / halfLife;
}

type MassInput = Pick<WasteItem, 'mass' | 'containerTare'>;

/**
 * Masse NETTE du déchet en grammes : masse brute − tare du contenant.
 * La tare est facultative : si elle est absente, la masse brute fait office de masse nette
 * (comportement historique conservé pour les enregistrements antérieurs).
 * Null si la masse brute est absente/invalide, ou si la tare rend la masse nette ≤ 0.
 */
export function netMassG(item: MassInput): number | null {
  const { mass, containerTare } = item;
  if (typeof mass !== 'number' || mass <= 0) return null;
  if (typeof containerTare !== 'number' || containerTare <= 0) return mass;
  const net = mass - containerTare;
  return net > 0 ? net : null;
}

/**
 * Activité massique résiduelle en Bq/g — LE critère réglementaire.
 * activite_massique = activite_residuelle_MBq × 1e6 / masse nette (dictionnaire de données, v2).
 * Null si masse nette indisponible ou activité incalculable.
 */
export function massicActivityBqPerG(item: Pick<WasteItem, 'initialActivity' | 'measureDate' | 'halfLife' | 'mass' | 'containerTare'>, now: Date = new Date()): number | null {
  const residualMBq = residualActivityMBq(item, now);
  if (residualMBq === null) return null;
  const net = netMassG(item);
  if (net === null) return null;
  return (residualMBq * BQ_PER_MBQ) / net;
}

/** Niveau de libération applicable (Bq/g) : override de l'item sinon table de référence. Null si inconnu. */
export function applicableClearanceLevel(item: Pick<WasteItem, 'radionuclide' | 'clearanceLevelBqPerG'>): number | null {
  if (typeof item.clearanceLevelBqPerG === 'number' && item.clearanceLevelBqPerG > 0) {
    return item.clearanceLevelBqPerG;
  }
  return referenceClearanceLevel(item.radionuclide);
}

type ReleaseInput = Pick<WasteItem, 'initialActivity' | 'measureDate' | 'halfLife' | 'mass' | 'containerTare' | 'radionuclide' | 'clearanceLevelBqPerG'>;

/**
 * Durée théorique de libération `t_lib` en HEURES : temps nécessaire, à partir de la mesure
 * initiale, pour que l'activité massique descende au niveau de libération.
 *
 *   t_lib = (T½ / ln2) × ln[ A0 × 1e6 / (niveau_liberation × masse_nette) ]
 *
 * Forme générique de la formule du dictionnaire de données v2, qui la spécialise au Tc-99m :
 * 8,666 × ln[A0 × 1e6 / (100 × masse nette)] — car T½/ln2 = 6,0067/0,6931 = 8,666 h et le
 * niveau de libération du Tc-99m est 100 Bq/g. Ici T½ et le seuil viennent du radionucléide,
 * ce qui étend le calcul à l'I-131, au F-18, etc.
 *
 * Renvoie 0 si le déchet est déjà sous le seuil dès la mesure initiale (aucune attente requise).
 * Null si une donnée manque (activité, masse nette, demi-vie ou niveau de libération).
 */
export function theoreticalReleaseHours(item: ReleaseInput): number | null {
  const { initialActivity, halfLife } = item;
  if (typeof halfLife !== 'number' || halfLife <= 0) return null;
  if (typeof initialActivity !== 'number' || initialActivity <= 0) return null;
  const net = netMassG(item);
  if (net === null) return null;
  const clearance = applicableClearanceLevel(item);
  if (clearance === null || clearance <= 0) return null;

  const initialMassicBqPerG = (initialActivity * BQ_PER_MBQ) / net;
  if (initialMassicBqPerG <= clearance) return 0;
  return (halfLife / Math.LN2) * Math.log(initialMassicBqPerG / clearance);
}

/** Date théorique à laquelle l'activité massique passe sous le seuil de libération. Null si incalculable. */
export function theoreticalReleaseDate(item: ReleaseInput): Date | null {
  const { measureDate } = item;
  if (!measureDate) return null;
  const measure = new Date(measureDate).getTime();
  if (Number.isNaN(measure)) return null;
  const hoursNeeded = theoreticalReleaseHours(item);
  if (hoursNeeded === null) return null;
  return new Date(measure + hoursNeeded * MS_PER_HOUR);
}

/**
 * Durée de stockage RÉELLE en heures : date de sortie − date d'entrée en stockage.
 * La date de sortie retenue est la date d'élimination, à défaut la date du contrôle de sortie.
 * Null si l'une des deux dates manque, est invalide, ou si la sortie précède l'entrée.
 */
export function storageDurationHours(item: Pick<WasteItem, 'storageEntryDate' | 'eliminationDate' | 'exitControlDate'>): number | null {
  const exitIso = item.eliminationDate ?? item.exitControlDate;
  if (!item.storageEntryDate || !exitIso) return null;
  const entry = new Date(item.storageEntryDate).getTime();
  const exit = new Date(exitIso).getTime();
  if (Number.isNaN(entry) || Number.isNaN(exit)) return null;
  const hours = (exit - entry) / MS_PER_HOUR;
  return hours >= 0 ? hours : null;
}

type ConformityInput = ReleaseInput & Pick<WasteItem, 'storageEntryDate' | 'eliminationDate' | 'exitControlDate'>;

/**
 * Instant auquel figer l'évaluation de conformité.
 *
 * Pour un déchet DÉJÀ SORTI (date d'élimination ou de contrôle de sortie renseignée), la conformité
 * est une PREUVE DOCUMENTAIRE : elle doit se juger à la date de sortie et rester immuable ensuite.
 * L'évaluer à `now` serait un défaut de sécurité clinique — l'activité massique continue de décroître
 * après la sortie, si bien qu'un déchet libéré trop tôt (au-dessus du seuil au moment réel) finirait
 * par s'afficher « conforme » avec le temps.
 *
 * Pour un déchet encore en stock, il n'y a pas de date de sortie : on évalue à `now` (projection),
 * mais `conforme` restera de toute façon null tant que la sortie n'est pas enregistrée.
 */
export function conformityInstant(item: Pick<WasteItem, 'eliminationDate' | 'exitControlDate'>, now: Date = new Date()): Date {
  const exitIso = item.eliminationDate ?? item.exitControlDate;
  if (exitIso) {
    const t = new Date(exitIso).getTime();
    if (!Number.isNaN(t)) return new Date(t);
  }
  return now;
}

/**
 * Indice de conformité = durée de stockage réelle / durée théorique de libération.
 * ≥ 1 ⇒ le déchet a été gardé au moins aussi longtemps que la décroissance l'exigeait.
 * Null si l'un des deux termes est incalculable, ou si t_lib = 0 (le rapport n'a alors pas
 * de sens : aucune attente n'était requise — voir `meetsDurationCriterion` dans `evaluateConformity`).
 */
export function conformityIndex(item: ConformityInput): number | null {
  const tLib = theoreticalReleaseHours(item);
  if (tLib === null || tLib <= 0) return null;
  const stored = storageDurationHours(item);
  if (stored === null) return null;
  return stored / tLib;
}

/** Débit de dose de sortie NET du bruit de fond (µSv/h). Null si la mesure de sortie manque. */
export function netExitDoseRate(item: Pick<WasteItem, 'exitDoseRate' | 'exitBackgroundDoseRate'>): number | null {
  const { exitDoseRate, exitBackgroundDoseRate } = item;
  if (typeof exitDoseRate !== 'number' || !Number.isFinite(exitDoseRate)) return null;
  if (typeof exitBackgroundDoseRate !== 'number' || !Number.isFinite(exitBackgroundDoseRate)) return exitDoseRate;
  return Math.max(0, exitDoseRate - exitBackgroundDoseRate);
}

export interface ConformityEvaluation {
  netMassG: number | null;
  massicBqPerG: number | null;
  clearanceLevelBqPerG: number | null;
  tLibHours: number | null;
  storageHours: number | null;
  conformityIndex: number | null;
  meetsMassicCriterion: boolean;
  meetsDurationCriterion: boolean;
  /** Conformité CALCULÉE (jamais saisie) : activité massique ≤ seuil ET indice de conformité ≥ 1. */
  conforme: boolean | null;
  missing: string[];
}

/**
 * Conformité CALCULÉE au sens du dictionnaire de données v2 :
 * « Vrai si activite_massique_Bq_g ≤ seuil ET indice_conformite ≥ 1 — JAMAIS saisi à la main. »
 *
 * Indicateur de preuve documentaire, distinct du statut opérationnel « libérable » de
 * l'application (qui, lui, applique la règle OU voulue par l'utilisateur). `conforme` vaut
 * null tant que les données nécessaires manquent : on ne déclare jamais conforme par défaut.
 */
export function evaluateConformity(item: ConformityInput, now: Date = new Date()): ConformityEvaluation {
  // Activité massique figée à la date de sortie pour un déchet éliminé (preuve documentaire immuable).
  const instant = conformityInstant(item, now);
  const net = netMassG(item);
  const massic = massicActivityBqPerG(item, instant);
  const clearance = applicableClearanceLevel(item);
  const tLib = theoreticalReleaseHours(item);
  const stored = storageDurationHours(item);
  const index = conformityIndex(item);
  const missing: string[] = [];

  if (typeof item.initialActivity !== 'number' || item.initialActivity <= 0) missing.push('Activité initiale (MBq)');
  if (net === null) missing.push('Masse nette (masse brute − tare)');
  if (typeof item.halfLife !== 'number' || item.halfLife <= 0) missing.push('Demi-vie physique (h)');
  if (!item.measureDate || Number.isNaN(new Date(item.measureDate).getTime())) missing.push('Date de mesure');
  if (clearance === null) missing.push('Niveau de libération (Bq/g)');
  if (!item.storageEntryDate) missing.push("Date d'entrée en stockage");
  if (!item.eliminationDate && !item.exitControlDate) missing.push('Date de sortie');

  const meetsMassicCriterion = massic !== null && clearance !== null && massic <= clearance;
  // t_lib = 0 : aucune attente n'était requise, le critère de durée est rempli d'office.
  const meetsDurationCriterion =
    tLib !== null && (tLib <= 0 ? stored !== null : index !== null && index >= 1);

  const computable = missing.length === 0 && massic !== null && tLib !== null && stored !== null;

  return {
    netMassG: net,
    massicBqPerG: massic,
    clearanceLevelBqPerG: clearance,
    tLibHours: tLib,
    storageHours: stored,
    conformityIndex: index,
    meetsMassicCriterion,
    meetsDurationCriterion,
    conforme: computable ? meetsMassicCriterion && meetsDurationCriterion : null,
    missing,
  };
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
  /** Critère de stockage rempli : activité massique sous le seuil OU ≥ 10 périodes. Le contrôle du débit de dose se fait à la sortie. */
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
  const meetsTenHalfLivesCriterion = halfLives !== null && halfLives >= MIN_HALF_LIVES_FOR_RELEASE;
  // Règle « OU » : une seule des deux conditions suffit à rendre le déchet libérable.
  const meetsStorageReleaseCriteria = meetsMassicCriterion || meetsTenHalfLivesCriterion;

  // Les motifs de blocage ne sont renseignés que si AUCUNE des deux conditions n'est remplie.
  if (!meetsStorageReleaseCriteria) {
    if (massicBqPerG === null) reasons.push('Activité massique incalculable (activité, masse ou date de mesure manquante).');
    else if (clearance === null) reasons.push('Niveau de libération inconnu pour ce radionucléide (à renseigner).');
    else reasons.push('Activité massique résiduelle au-dessus du seuil de libération.');

    if (halfLives === null) reasons.push('Nombre de périodes écoulées incalculable (demi-vie ou date de mesure manquante).');
    else reasons.push(`Moins de ${MIN_HALF_LIVES_FOR_RELEASE} périodes écoulées (${halfLives.toFixed(1)}).`);
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
    meetsStorageReleaseCriteria,
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
