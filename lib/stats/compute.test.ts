import { describe, it, expect } from 'vitest';
import type { WasteItem, Incident } from '@/types';
import { computeStats, statsToCsvRows } from './compute';
import { WASTE_EXPORT_COLUMNS, wasteExportHeaders, wasteExportRows, wasteExportRecords } from '@/lib/export/csv';

const base = '2024-01-01T00:00:00.000Z';

function waste(p: Partial<WasteItem>): WasteItem {
  return {
    id: Math.random().toString(36).slice(2),
    createdAt: base,
    type: 'solide',
    hospitalId: 'h1',
    radionuclide: 'Tc-99m',
    status: 'stockage',
    ...p,
  };
}

/** Décale une date ISO de `hours` heures. */
function plusHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

const TC99M_HALF_LIFE = 6.0067; // heures
const TC99M_CLEARANCE = 100; // Bq/g (table de référence)

/**
 * Déchet Tc-99m de 100 MBq pour 1000 g nets : activité massique initiale 1e5 Bq/g, soit 1000 ×
 * le niveau de libération. t_lib = (T½ / ln2) × ln(1000) ≈ 59,9 h.
 */
const T_LIB_HOURS = (TC99M_HALF_LIFE / Math.LN2) * Math.log(1e5 / TC99M_CLEARANCE);

function eliminated(p: Partial<WasteItem>): WasteItem {
  return waste({
    status: 'elimine',
    initialActivity: 100,
    mass: 1000,
    halfLife: TC99M_HALF_LIFE,
    measureDate: base,
    storageEntryDate: base,
    ...p,
  });
}

describe('computeStats', () => {
  const items: WasteItem[] = [
    waste({ status: 'stockage', radionuclide: 'Tc-99m', initialActivity: 100, dailyPatientCount: 10, dailyExamTypes: ['Osseuse', 'Rénale'] }),
    waste({ status: 'liberable', radionuclide: 'F-18', initialActivity: 50, dailyPatientCount: 5, dailyExamTypes: ['Osseuse'] }),
    waste({ status: 'elimine', radionuclide: 'Tc-99m', initialActivity: 200, eliminationMode: 'Filière agréée', exitConformity: true, storageEntryDate: base, eliminationDate: '2024-01-11T00:00:00.000Z' }),
    waste({ status: 'elimine', radionuclide: 'I-131', initialActivity: 80, eliminationMode: 'Filière agréée', exitConformity: false }),
  ];
  const incidents: Incident[] = [
    { id: 'i1', date: base, type: 'Contamination', hospitalId: 'h1', doseRateBefore: 100, doseRateAfter: 2 },
  ];
  const s = computeStats(items, incidents, new Date('2024-02-01T00:00:00.000Z'));

  it('compte les totaux', () => {
    expect(s.totals.total).toBe(4);
    expect(s.totals.stockage).toBe(1);
    expect(s.totals.liberable).toBe(1);
    expect(s.totals.elimine).toBe(2);
    expect(s.totals.nonConforme).toBe(1);
  });

  it('agrège l\'activité initiale', () => {
    expect(s.activity.initialTotalMBq).toBe(430);
    expect(s.activity.eliminatedInitialMBq).toBe(280);
  });

  it('regroupe par radionucléide', () => {
    const tc = s.byRadionuclide.find((r) => r.radionuclide === 'Tc-99m');
    expect(tc?.count).toBe(2);
  });

  it('calcule conformité et délai moyen de stockage', () => {
    expect(s.conformity.conforme).toBe(1);
    expect(s.conformity.derogation).toBe(1);
    expect(s.meanStorageDays).toBeCloseTo(10, 5);
  });

  it('agrège l\'activité du jour et les examens', () => {
    expect(s.daily.totalPatients).toBe(15);
    const osseuse = s.daily.byExamType.find((e) => e.label === 'Osseuse');
    expect(osseuse?.count).toBe(2);
  });

  it('moyenne les doses d\'incident', () => {
    expect(s.incidents.meanDoseBefore).toBe(100);
    expect(s.incidents.meanDoseAfter).toBe(2);
  });

  it('ne déclare pas conformes des déchets sans données (masse et demi-vie absentes)', () => {
    expect(s.computedConformity.evaluated).toBe(2);
    expect(s.computedConformity.conforme).toBe(0);
    expect(s.computedConformity.indetermine).toBe(2);
  });
});

describe('computeStats — conformité calculée', () => {
  const now = new Date(plusHours(base, 500));
  const items: WasteItem[] = [
    // Gardé 100 h alors que t_lib ≈ 59,9 h : indice ≈ 1,67 et activité massique effondrée.
    eliminated({ eliminationDate: plusHours(base, 100) }),
    // Gardé 120 h : indice ≈ 2,0.
    eliminated({ eliminationDate: plusHours(base, 120) }),
    // Sorti au bout de 10 h : indice ≈ 0,17 — sorti trop tôt.
    eliminated({ eliminationDate: plusHours(base, 10) }),
    // Aucune donnée de radioactivité : conformité indéterminable.
    eliminated({ initialActivity: undefined, mass: undefined, halfLife: undefined, eliminationDate: plusHours(base, 100) }),
    // En stockage : hors périmètre d'évaluation.
    waste({ status: 'stockage', initialActivity: 100, mass: 1000, halfLife: TC99M_HALF_LIFE, measureDate: base }),
  ];
  const cc = computeStats(items, [], now).computedConformity;

  it('n\'évalue que les déchets éliminés', () => {
    expect(cc.evaluated).toBe(4);
  });

  it('classe conformes, non conformes et indéterminés', () => {
    expect(cc.conforme).toBe(2);
    expect(cc.nonConforme).toBe(1);
    expect(cc.indetermine).toBe(1);
    expect(cc.conforme + cc.nonConforme + cc.indetermine).toBe(cc.evaluated);
  });

  it('calcule les taux sur les déchets éliminés', () => {
    expect(cc.conformeRate).toBeCloseTo(50, 5);
    expect(cc.nonConformeRate).toBeCloseTo(25, 5);
    expect(cc.indetermineRate).toBeCloseTo(25, 5);
  });

  it('calcule l\'indice de conformité moyen et médian', () => {
    const indices = [100, 120, 10].map((h) => h / T_LIB_HOURS).sort((a, b) => a - b);
    expect(cc.medianIndex).toBeCloseTo(indices[1], 6);
    expect(cc.meanIndex).toBeCloseTo((indices[0] + indices[1] + indices[2]) / 3, 6);
  });

  it('compte les déchets sortis trop tôt (indice < 1)', () => {
    expect(cc.releasedTooEarly).toBe(1);
  });

  it('compare la durée de stockage moyenne au t_lib moyen', () => {
    // La moyenne des durées ignore le déchet indéterminé, dont la date de sortie existe pourtant :
    // sa durée de stockage est mesurable même si sa conformité ne l'est pas.
    expect(cc.meanStorageHours).toBeCloseTo((100 + 120 + 10 + 100) / 4, 5);
    expect(cc.meanTLibHours).toBeCloseTo(T_LIB_HOURS, 5);
  });

  it('tient compte de la tare : la masse nette change t_lib', () => {
    const withTare = [eliminated({ mass: 1200, containerTare: 200, eliminationDate: plusHours(base, 100) })];
    const stats = computeStats(withTare, [], now).computedConformity;
    // Masse nette 1000 g : même t_lib que sans tare pour 1000 g de masse brute.
    expect(stats.meanTLibHours).toBeCloseTo(T_LIB_HOURS, 5);
  });
});

describe('computeStats — cas limites', () => {
  it('ne divise pas par zéro sans aucun déchet', () => {
    const s = computeStats([], [], new Date(base));
    const cc = s.computedConformity;
    expect(cc.evaluated).toBe(0);
    expect(cc.conformeRate).toBeNull();
    expect(cc.nonConformeRate).toBeNull();
    expect(cc.indetermineRate).toBeNull();
    expect(cc.meanIndex).toBeNull();
    expect(cc.medianIndex).toBeNull();
    expect(cc.meanStorageHours).toBeNull();
    expect(cc.meanTLibHours).toBeNull();
    expect(cc.releasedTooEarly).toBe(0);
    for (const c of s.completeness) {
      expect(c.total).toBe(0);
      expect(c.filled).toBe(0);
      expect(c.rate).toBeNull();
    }
  });

  it('ne produit aucun NaN quand aucun déchet n\'est éliminé', () => {
    const s = computeStats([waste({ status: 'stockage' }), waste({ status: 'liberable' })], [], new Date(base));
    const values = Object.values(s.computedConformity);
    expect(values.some((v) => typeof v === 'number' && Number.isNaN(v))).toBe(false);
    expect(s.computedConformity.evaluated).toBe(0);
    expect(s.computedConformity.conformeRate).toBeNull();
  });

  it('compte tous les éliminés comme indéterminés quand toutes les données manquent', () => {
    const s = computeStats([waste({ status: 'elimine' }), waste({ status: 'elimine' })], [], new Date(base));
    const cc = s.computedConformity;
    expect(cc.indetermine).toBe(2);
    expect(cc.conforme).toBe(0);
    expect(cc.nonConforme).toBe(0);
    expect(cc.indetermineRate).toBe(100);
    expect(cc.meanIndex).toBeNull();
    expect(cc.medianIndex).toBeNull();
  });
});

describe('computeStats — complétude des données', () => {
  const items: WasteItem[] = [
    waste({ status: 'stockage', mass: 500, measureDate: base }),
    waste({ status: 'stockage', mass: 800, containerTare: 50, backgroundDoseRate: 0.1, measureDate: base }),
    waste({ status: 'elimine', mass: 900, eliminationDate: plusHours(base, 50), exitDoseRate: 0.3 }),
    waste({ status: 'elimine', mass: 900, eliminationDate: plusHours(base, 60) }),
  ];
  const completeness = computeStats(items, [], new Date(base)).completeness;
  const field = (label: string) => completeness.find((c) => c.label === label);

  it('rend visible un champ jamais renseigné (0 %)', () => {
    const activity = field('Activité initiale (MBq)');
    expect(activity?.filled).toBe(0);
    expect(activity?.total).toBe(4);
    expect(activity?.rate).toBe(0);
  });

  it('mesure les champs partiellement renseignés sur tout le parc', () => {
    expect(field('Masse brute (g)')?.rate).toBe(100);
    expect(field('Tare du contenant (g)')?.filled).toBe(1);
    expect(field('Tare du contenant (g)')?.rate).toBe(25);
    expect(field('Bruit de fond du local (µSv/h)')?.rate).toBe(25);
  });

  it('restreint les champs de sortie au périmètre des déchets éliminés', () => {
    const exitDose = field('Débit de dose de sortie au contact (µSv/h)');
    expect(exitDose?.scope).toBe('elimines');
    expect(exitDose?.total).toBe(2);
    expect(exitDose?.filled).toBe(1);
    expect(exitDose?.rate).toBe(50);
    expect(field('Date de sortie')?.rate).toBe(100);
    expect(field('Bruit de fond à la sortie (µSv/h)')?.rate).toBe(0);
  });
});

describe('statsToCsvRows', () => {
  const s = computeStats([eliminated({ eliminationDate: plusHours(base, 100) })], [], new Date(plusHours(base, 500)));
  const rows = statsToCsvRows(s);
  const sections = new Set(rows.map((r) => r[0]));

  it('exporte les sections conformité calculée et complétude', () => {
    expect(sections.has('Conformité calculée')).toBe(true);
    expect(sections.has('Complétude des données')).toBe(true);
  });

  it('exporte les indicateurs de conformité chiffrés', () => {
    const index = rows.find((r) => r[1] === 'Indice de conformité médian');
    expect(index?.[2]).toBe((100 / T_LIB_HOURS).toFixed(3));
    expect(rows.find((r) => r[1] === 'Taux de conformes')?.[2]).toBe('100.0 %');
  });
});

describe('export ligne-par-déchet', () => {
  const now = new Date(plusHours(base, 500));
  const item = eliminated({
    registryNumber: 'R-1',
    containerTare: 200,
    mass: 1200,
    backgroundDoseRate: 0.12,
    doseRateContact: 5,
    doseRate1m: 1,
    eliminationDate: plusHours(base, 100),
    exitControlDate: plusHours(base, 100),
    exitDoseRate: 0.4,
    exitDoseRate1m: 0.1,
    exitBackgroundDoseRate: 0.1,
  });
  const headers = wasteExportHeaders();
  const [row] = wasteExportRows([item], now);
  const [record] = wasteExportRecords([item], now);
  const cell = (header: string) => row[headers.indexOf(header)];

  it('embarque les champs saisis du dictionnaire de données v2', () => {
    expect(cell('Masse brute (g)')).toBe('1200');
    expect(cell('Tare du contenant (g)')).toBe('200');
    expect(cell('Bruit de fond du local (µSv/h)')).toBe('0.12');
    expect(cell('Bruit de fond à la sortie (µSv/h)')).toBe('0.1');
    expect(cell('Débit de dose de sortie au contact (µSv/h)')).toBe('0.4');
    expect(cell('Débit de dose de sortie à 1 m (µSv/h)')).toBe('0.1');
  });

  it('embarque les champs calculés', () => {
    expect(cell('Masse nette calculée (g)')).toBe('1000.00');
    expect(cell('Niveau de libération applicable (Bq/g)')).toBe(String(TC99M_CLEARANCE));
    expect(cell('Durée théorique de libération t_lib (h)')).toBe(T_LIB_HOURS.toFixed(2));
    expect(cell('Durée de stockage réelle (h)')).toBe('100.00');
    expect(cell('Indice de conformité')).toBe((100 / T_LIB_HOURS).toFixed(3));
    expect(cell('Conformité calculée')).toBe('CONFORME');
    expect(cell('Débit de dose de sortie net du bruit de fond (µSv/h)')).toBe('0.30');
  });

  it('laisse les cellules vides quand la donnée manque, sans fabriquer de zéro', () => {
    const bare = waste({ status: 'stockage' });
    const [bareRow] = wasteExportRows([bare], now);
    const bareCell = (header: string) => bareRow[headers.indexOf(header)];
    expect(bareCell('Activité initiale (MBq)')).toBe('');
    expect(bareCell('Masse brute (g)')).toBe('');
    expect(bareCell('Tare du contenant (g)')).toBe('');
    expect(bareCell('Masse nette calculée (g)')).toBe('');
    expect(bareCell('Bruit de fond du local (µSv/h)')).toBe('');
    expect(bareCell('Indice de conformité')).toBe('');
    expect(bareCell('Conformité calculée')).toBe('INDÉTERMINÉ');
    expect(bareCell('Données manquantes (conformité)')).toContain('Activité initiale');
  });

  it('expose exactement les mêmes champs en JSON qu\'en CSV', () => {
    expect(Object.keys(record)).toEqual(WASTE_EXPORT_COLUMNS.map((c) => c.key));
    expect(row).toHaveLength(headers.length);
    expect(record.mass).toBe(1200);
    expect(record.netMassG).toBe(1000);
    expect(record.computedConformity).toBe('CONFORME');
  });

  it('utilise null (et non 0) en JSON pour une donnée absente', () => {
    const [bareRecord] = wasteExportRecords([waste({ status: 'stockage' })], now);
    expect(bareRecord.initialActivity).toBeNull();
    expect(bareRecord.mass).toBeNull();
    expect(bareRecord.containerTare).toBeNull();
    expect(bareRecord.exitDoseRate).toBeNull();
    expect(bareRecord.conformityIndex).toBeNull();
  });
});
