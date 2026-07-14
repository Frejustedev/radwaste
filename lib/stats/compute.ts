import type { WasteItem, Incident } from '@/types';
import { residualActivityMBq, evaluateConformity } from '@/lib/physics/decay';

export interface CountStat { label: string; count: number; }
export interface RadionuclideStat {
  radionuclide: string;
  count: number;
  initialActivityMBq: number;
  residualActivityMBq: number;
}
export interface MonthlyStat { month: string; created: number; eliminated: number; }

/**
 * Conformité CALCULÉE (lib/physics), évaluée sur les seuls déchets ÉLIMINÉS.
 * Distincte de `conformity`, qui compte la conformité DÉCLARÉE par le contrôleur.
 * Les taux sont en pourcentage, ou null quand aucun déchet n'a été éliminé (pas de division par zéro).
 */
export interface ComputedConformityStats {
  evaluated: number;
  conforme: number;
  nonConforme: number;
  indetermine: number;
  conformeRate: number | null;
  nonConformeRate: number | null;
  indetermineRate: number | null;
  meanIndex: number | null;
  medianIndex: number | null;
  meanStorageHours: number | null;
  meanTLibHours: number | null;
  /** Déchets sortis avant la fin de la décroissance théorique (indice de conformité < 1). */
  releasedTooEarly: number;
}

/** Taux de remplissage d'un champ critique du dossier. `rate` est null si le périmètre est vide. */
export interface CompletenessStat {
  label: string;
  scope: 'tous' | 'elimines';
  filled: number;
  total: number;
  rate: number | null;
}

export interface StatsResult {
  totals: {
    total: number;
    stockage: number;
    liberable: number;
    elimine: number;
    nonConforme: number;
    incidents: number;
  };
  activity: {
    initialTotalMBq: number;
    residualTotalMBq: number;
    eliminatedInitialMBq: number;
  };
  byRadionuclide: RadionuclideStat[];
  byType: CountStat[];
  byService: CountStat[];
  byStatus: CountStat[];
  byEliminationMode: CountStat[];
  conformity: { conforme: number; derogation: number };
  computedConformity: ComputedConformityStats;
  completeness: CompletenessStat[];
  meanStorageDays: number | null;
  incidents: {
    total: number;
    byType: CountStat[];
    meanDoseBefore: number | null;
    meanDoseAfter: number | null;
  };
  daily: {
    totalPatients: number;
    totalElutionMBq: number;
    recordsWithData: number;
    byExamType: CountStat[];
  };
  monthly: MonthlyStat[];
}

const MS_PER_DAY = 86_400_000;

function tally(map: Map<string, number>, key: string | undefined, by = 1) {
  const k = key && key.trim() ? key : '(non renseigné)';
  map.set(k, (map.get(k) ?? 0) + by);
}

function toCountStats(map: Map<string, number>): CountStat[] {
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Pourcentage, ou null si le dénominateur est nul. */
function rate(part: number, total: number): number | null {
  return total > 0 ? (part / total) * 100 : null;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function hasNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasDate(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(new Date(value).getTime());
}

/**
 * Champs critiques du dictionnaire de données dont on mesure le taux de remplissage.
 * Les champs de sortie ne sont comptés que sur les déchets éliminés, seul périmètre où ils sont attendus.
 */
const COMPLETENESS_FIELDS: { label: string; scope: 'tous' | 'elimines'; filled: (w: WasteItem) => boolean }[] = [
  { label: 'Activité initiale (MBq)', scope: 'tous', filled: (w) => hasNumber(w.initialActivity) },
  { label: 'Masse brute (g)', scope: 'tous', filled: (w) => hasNumber(w.mass) },
  { label: 'Tare du contenant (g)', scope: 'tous', filled: (w) => hasNumber(w.containerTare) },
  { label: 'Demi-vie (h)', scope: 'tous', filled: (w) => hasNumber(w.halfLife) },
  { label: 'Date et heure de mesure', scope: 'tous', filled: (w) => hasDate(w.measureDate) },
  { label: 'Bruit de fond du local (µSv/h)', scope: 'tous', filled: (w) => hasNumber(w.backgroundDoseRate) },
  { label: 'Débit de dose au contact (µSv/h)', scope: 'tous', filled: (w) => hasNumber(w.doseRateContact) },
  { label: 'Débit de dose à 1 m (µSv/h)', scope: 'tous', filled: (w) => hasNumber(w.doseRate1m) },
  { label: "Date d'entrée en stockage", scope: 'tous', filled: (w) => hasDate(w.storageEntryDate) },
  { label: 'Date de sortie', scope: 'elimines', filled: (w) => hasDate(w.eliminationDate) || hasDate(w.exitControlDate) },
  { label: 'Bruit de fond à la sortie (µSv/h)', scope: 'elimines', filled: (w) => hasNumber(w.exitBackgroundDoseRate) },
  { label: 'Débit de dose de sortie au contact (µSv/h)', scope: 'elimines', filled: (w) => hasNumber(w.exitDoseRate) },
  { label: 'Débit de dose de sortie à 1 m (µSv/h)', scope: 'elimines', filled: (w) => hasNumber(w.exitDoseRate1m) },
];

/** Taux de remplissage de chaque champ critique — rend visibles les trous du registre. */
export function computeCompleteness(wasteItems: WasteItem[]): CompletenessStat[] {
  const eliminated = wasteItems.filter((w) => w.status === 'elimine');
  return COMPLETENESS_FIELDS.map(({ label, scope, filled }) => {
    const pool = scope === 'elimines' ? eliminated : wasteItems;
    const count = pool.reduce((n, w) => n + (filled(w) ? 1 : 0), 0);
    return { label, scope, filled: count, total: pool.length, rate: rate(count, pool.length) };
  });
}

/** Agrège la conformité CALCULÉE sur les déchets éliminés (indicateur de preuve documentaire). */
export function computeComputedConformity(wasteItems: WasteItem[], now: Date = new Date()): ComputedConformityStats {
  const eliminated = wasteItems.filter((w) => w.status === 'elimine');
  const indices: number[] = [];
  const storageHours: number[] = [];
  const tLibHours: number[] = [];
  let conforme = 0, nonConforme = 0, indetermine = 0, releasedTooEarly = 0;

  for (const w of eliminated) {
    const ev = evaluateConformity(w, now);
    if (ev.conforme === null) indetermine += 1;
    else if (ev.conforme) conforme += 1;
    else nonConforme += 1;

    if (ev.conformityIndex !== null) {
      indices.push(ev.conformityIndex);
      if (ev.conformityIndex < 1) releasedTooEarly += 1;
    }
    if (ev.storageHours !== null) storageHours.push(ev.storageHours);
    if (ev.tLibHours !== null) tLibHours.push(ev.tLibHours);
  }

  const evaluated = eliminated.length;
  return {
    evaluated,
    conforme,
    nonConforme,
    indetermine,
    conformeRate: rate(conforme, evaluated),
    nonConformeRate: rate(nonConforme, evaluated),
    indetermineRate: rate(indetermine, evaluated),
    meanIndex: mean(indices),
    medianIndex: median(indices),
    meanStorageHours: mean(storageHours),
    meanTLibHours: mean(tLibHours),
    releasedTooEarly,
  };
}

/** Calcule l'ensemble des statistiques à partir d'un jeu (déjà filtré) de déchets et incidents. */
export function computeStats(wasteItems: WasteItem[], incidents: Incident[], now: Date = new Date()): StatsResult {
  const typeMap = new Map<string, number>();
  const serviceMap = new Map<string, number>();
  const statusMap = new Map<string, number>();
  const elimModeMap = new Map<string, number>();
  const examMap = new Map<string, number>();
  const rnMap = new Map<string, RadionuclideStat>();

  let initialTotal = 0;
  let residualTotal = 0;
  let eliminatedInitial = 0;
  let stockage = 0, liberable = 0, elimine = 0, nonConforme = 0;
  let conforme = 0, derogation = 0;
  let totalPatients = 0, totalElution = 0, recordsWithData = 0;
  const storageDurations: number[] = [];

  for (const w of wasteItems) {
    tally(typeMap, w.type);
    tally(serviceMap, w.originService);
    tally(statusMap, w.status);

    const init = typeof w.initialActivity === 'number' ? w.initialActivity : 0;
    initialTotal += init;

    const rn = rnMap.get(w.radionuclide) ?? { radionuclide: w.radionuclide, count: 0, initialActivityMBq: 0, residualActivityMBq: 0 };
    rn.count += 1;
    rn.initialActivityMBq += init;
    if (w.status === 'stockage' || w.status === 'liberable') {
      const res = residualActivityMBq(w, now);
      if (res !== null) { rn.residualActivityMBq += res; residualTotal += res; }
    }
    rnMap.set(w.radionuclide, rn);

    if (w.status === 'stockage') stockage += 1;
    else if (w.status === 'liberable') liberable += 1;
    else if (w.status === 'elimine') {
      elimine += 1;
      eliminatedInitial += init;
      tally(elimModeMap, w.eliminationMode);
      if (w.exitConformity === false) { derogation += 1; nonConforme += 1; }
      else conforme += 1;
      if (w.storageEntryDate && w.eliminationDate) {
        const entry = new Date(w.storageEntryDate).getTime();
        const out = new Date(w.eliminationDate).getTime();
        if (!Number.isNaN(entry) && !Number.isNaN(out) && out >= entry) storageDurations.push((out - entry) / MS_PER_DAY);
      }
    }

    if (w.dailyPatientCount != null || w.dailyElution != null || (w.dailyExamTypes?.length ?? 0) > 0) recordsWithData += 1;
    if (typeof w.dailyPatientCount === 'number') totalPatients += w.dailyPatientCount;
    if (typeof w.dailyElution === 'number') totalElution += w.dailyElution;
    for (const exam of w.dailyExamTypes ?? []) tally(examMap, exam);
  }

  // Incidents
  const incTypeMap = new Map<string, number>();
  const dosesBefore: number[] = [];
  const dosesAfter: number[] = [];
  for (const i of incidents) {
    tally(incTypeMap, i.type);
    if (typeof i.doseRateBefore === 'number') dosesBefore.push(i.doseRateBefore);
    if (typeof i.doseRateAfter === 'number') dosesAfter.push(i.doseRateAfter);
  }

  // Évolution mensuelle (12 derniers mois)
  const months: MonthlyStat[] = [];
  const monthIndex = new Map<string, MonthlyStat>();
  for (let k = 11; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const stat: MonthlyStat = { month: monthKey(d), created: 0, eliminated: 0 };
    months.push(stat);
    monthIndex.set(stat.month, stat);
  }
  for (const w of wasteItems) {
    if (w.createdAt) {
      const c = monthIndex.get(monthKey(new Date(w.createdAt)));
      if (c) c.created += 1;
    }
    if (w.eliminationDate) {
      const e = monthIndex.get(monthKey(new Date(w.eliminationDate)));
      if (e) e.eliminated += 1;
    }
  }

  return {
    totals: { total: wasteItems.length, stockage, liberable, elimine, nonConforme, incidents: incidents.length },
    activity: {
      initialTotalMBq: initialTotal,
      residualTotalMBq: residualTotal,
      eliminatedInitialMBq: eliminatedInitial,
    },
    byRadionuclide: Array.from(rnMap.values()).sort((a, b) => b.count - a.count),
    byType: toCountStats(typeMap),
    byService: toCountStats(serviceMap),
    byStatus: toCountStats(statusMap),
    byEliminationMode: toCountStats(elimModeMap),
    conformity: { conforme, derogation },
    computedConformity: computeComputedConformity(wasteItems, now),
    completeness: computeCompleteness(wasteItems),
    meanStorageDays: mean(storageDurations),
    incidents: {
      total: incidents.length,
      byType: toCountStats(incTypeMap),
      meanDoseBefore: mean(dosesBefore),
      meanDoseAfter: mean(dosesAfter),
    },
    daily: {
      totalPatients,
      totalElutionMBq: totalElution,
      recordsWithData,
      byExamType: toCountStats(examMap),
    },
    monthly: months,
  };
}

/** Aplati les statistiques en lignes « Section ; Élément ; Valeur » pour l'export CSV/Excel. */
export function statsToCsvRows(s: StatsResult): string[][] {
  const rows: string[][] = [];
  const add = (section: string, item: string, value: string | number) => rows.push([section, item, String(value)]);

  add('Totaux', 'Déchets (total)', s.totals.total);
  add('Totaux', 'En stockage', s.totals.stockage);
  add('Totaux', 'Libérables', s.totals.liberable);
  add('Totaux', 'Éliminés', s.totals.elimine);
  add('Totaux', 'Non conformes', s.totals.nonConforme);
  add('Totaux', 'Incidents', s.totals.incidents);

  add('Activité (MBq)', 'Activité initiale totale', s.activity.initialTotalMBq.toFixed(2));
  add('Activité (MBq)', 'Activité résiduelle (stock+libérables)', s.activity.residualTotalMBq.toFixed(2));
  add('Activité (MBq)', 'Activité initiale éliminée', s.activity.eliminatedInitialMBq.toFixed(2));

  s.byRadionuclide.forEach((r) => add('Par radionucléide', r.radionuclide, `${r.count} déchet(s) ; init ${r.initialActivityMBq.toFixed(2)} MBq ; résiduel ${r.residualActivityMBq.toFixed(2)} MBq`));
  s.byType.forEach((c) => add('Par type de déchet', c.label, c.count));
  s.byService.forEach((c) => add("Par service d'origine", c.label, c.count));
  s.byStatus.forEach((c) => add('Par statut', c.label, c.count));
  s.byEliminationMode.forEach((c) => add("Par mode d'élimination", c.label, c.count));

  add('Conformité des sorties', 'Conformes', s.conformity.conforme);
  add('Conformité des sorties', 'Dérogations (non conformes)', s.conformity.derogation);
  add('Délais', 'Durée moyenne de stockage (jours)', s.meanStorageDays !== null ? s.meanStorageDays.toFixed(1) : 'n/a');

  const cc = s.computedConformity;
  const pct = (v: number | null) => (v !== null ? `${v.toFixed(1)} %` : 'n/a');
  const dec = (v: number | null, digits: number) => (v !== null ? v.toFixed(digits) : 'n/a');
  add('Conformité calculée', 'Déchets éliminés évalués', cc.evaluated);
  add('Conformité calculée', 'Conformes', cc.conforme);
  add('Conformité calculée', 'Taux de conformes', pct(cc.conformeRate));
  add('Conformité calculée', 'Non conformes', cc.nonConforme);
  add('Conformité calculée', 'Taux de non conformes', pct(cc.nonConformeRate));
  add('Conformité calculée', 'Indéterminés (données manquantes)', cc.indetermine);
  add('Conformité calculée', "Taux d'indéterminés", pct(cc.indetermineRate));
  add('Conformité calculée', 'Indice de conformité médian', dec(cc.medianIndex, 3));
  add('Conformité calculée', 'Indice de conformité moyen', dec(cc.meanIndex, 3));
  add('Conformité calculée', 'Durée de stockage moyenne (h)', dec(cc.meanStorageHours, 2));
  add('Conformité calculée', 'Durée théorique de libération moyenne t_lib (h)', dec(cc.meanTLibHours, 2));
  add('Conformité calculée', 'Sortis trop tôt (indice < 1)', cc.releasedTooEarly);

  s.completeness.forEach((c) => {
    const scope = c.scope === 'elimines' ? 'éliminés' : 'tous';
    add('Complétude des données', `${c.label} [${scope}]`, `${c.filled}/${c.total} (${pct(c.rate)})`);
  });

  s.incidents.byType.forEach((c) => add('Incidents par type', c.label, c.count));
  add('Incidents', 'Dose moyenne avant (µSv/h)', s.incidents.meanDoseBefore !== null ? s.incidents.meanDoseBefore.toFixed(2) : 'n/a');
  add('Incidents', 'Dose moyenne après (µSv/h)', s.incidents.meanDoseAfter !== null ? s.incidents.meanDoseAfter.toFixed(2) : 'n/a');

  add('Activité du jour', 'Patients (total cumulé)', s.daily.totalPatients);
  add('Activité du jour', 'Élution (total cumulé, MBq)', s.daily.totalElutionMBq.toFixed(2));
  add('Activité du jour', 'Enregistrements renseignés', s.daily.recordsWithData);
  s.daily.byExamType.forEach((c) => add("Examens du jour (par type)", c.label, c.count));

  s.monthly.forEach((m) => add('Évolution mensuelle', m.month, `créés ${m.created} ; éliminés ${m.eliminated}`));

  return rows;
}
