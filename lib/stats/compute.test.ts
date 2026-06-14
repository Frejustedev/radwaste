import { describe, it, expect } from 'vitest';
import type { WasteItem, Incident } from '@/types';
import { computeStats } from './compute';

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
});
