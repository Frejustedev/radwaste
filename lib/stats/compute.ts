import type { WasteItem, Incident } from '@/types';
import { residualActivityMBq } from '@/lib/physics/decay';

export interface CountStat { label: string; count: number; }
export interface RadionuclideStat {
  radionuclide: string;
  count: number;
  initialActivityMBq: number;
  residualActivityMBq: number;
}
export interface MonthlyStat { month: string; created: number; eliminated: number; }

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

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
