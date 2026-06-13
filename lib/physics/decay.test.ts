import { describe, it, expect } from 'vitest';
import type { WasteItem } from '@/types';
import {
  elapsedHours,
  residualActivityMBq,
  decayPercentage,
  halfLivesElapsed,
  massicActivityBqPerG,
  theoreticalReleaseDate,
  evaluateDecay,
  evaluateExitControl,
} from './decay';

const base = '2024-01-01T00:00:00.000Z';
const after = (hours: number) => new Date(new Date(base).getTime() + hours * 3_600_000);

function item(partial: Partial<WasteItem> = {}): WasteItem {
  return {
    id: 'WST-TEST-001',
    createdAt: base,
    originService: 'labo chaud',
    responsibleOperator: 'Op',
    type: 'solide',
    hospitalId: 'h1',
    radionuclide: 'Tc-99m',
    initialActivity: 100, // MBq
    mass: 1000, // g
    measureDate: base,
    doseRateContact: 10,
    doseRate1m: 1,
    halfLife: 6, // h
    storageEntryDate: base,
    storageResponsible: 'Resp',
    expectedDecayDuration: 3,
    status: 'stockage',
    ...partial,
  };
}

describe('elapsedHours', () => {
  it('compte les heures écoulées', () => {
    expect(elapsedHours(base, after(6))).toBeCloseTo(6, 6);
  });
  it('ne renvoie jamais de valeur négative', () => {
    expect(elapsedHours(base, after(-5))).toBe(0);
  });
  it('renvoie null pour une date invalide', () => {
    expect(elapsedHours('pas-une-date', after(1))).toBeNull();
  });
});

describe('residualActivityMBq', () => {
  it('divise par deux à chaque période', () => {
    expect(residualActivityMBq(item(), after(6))).toBeCloseTo(50, 6);
    expect(residualActivityMBq(item(), after(12))).toBeCloseTo(25, 6);
    expect(residualActivityMBq(item(), after(0))).toBeCloseTo(100, 6);
  });
  it('renvoie null si halfLife <= 0', () => {
    expect(residualActivityMBq(item({ halfLife: 0 }), after(6))).toBeNull();
    expect(residualActivityMBq(item({ halfLife: -1 }), after(6))).toBeNull();
  });
});

describe('decayPercentage', () => {
  it('vaut 50% après une période', () => {
    expect(decayPercentage(item(), after(6))).toBeCloseTo(50, 6);
  });
  it('est borné à 100%', () => {
    expect(decayPercentage(item(), after(600))).toBeLessThanOrEqual(100);
  });
});

describe('halfLivesElapsed', () => {
  it('compte les périodes', () => {
    expect(halfLivesElapsed(item(), after(60))).toBeCloseTo(10, 6);
  });
});

describe('massicActivityBqPerG', () => {
  it('convertit MBq -> Bq puis divise par la masse', () => {
    // 100 MBq / 1000 g = 1e8 Bq / 1000 g = 1e5 Bq/g à t=0
    expect(massicActivityBqPerG(item(), after(0))).toBeCloseTo(1e5, 0);
  });
  it('renvoie null sans masse', () => {
    expect(massicActivityBqPerG(item({ mass: 0 }), after(0))).toBeNull();
  });
});

describe('theoreticalReleaseDate', () => {
  it('est postérieure à la mesure pour une activité au-dessus du seuil', () => {
    const d = theoreticalReleaseDate(item());
    expect(d).not.toBeNull();
    expect(d!.getTime()).toBeGreaterThan(new Date(base).getTime());
  });
  it('renvoie null sans masse', () => {
    expect(theoreticalReleaseDate(item({ mass: 0 }))).toBeNull();
  });
});

describe('evaluateDecay', () => {
  it('bloque la libération avant 10 périodes', () => {
    const e = evaluateDecay(item(), after(6));
    expect(e.meetsTenHalfLivesCriterion).toBe(false);
    expect(e.meetsStorageReleaseCriteria).toBe(false);
    expect(e.blockingReasons.length).toBeGreaterThan(0);
  });
  it('autorise la libération quand activité massique sous le seuil ET >= 10 périodes', () => {
    // Tc-99m clearance 1e2 Bq/g. À t=180h (30 périodes) l'activité massique est négligeable.
    const e = evaluateDecay(item(), after(180));
    expect(e.meetsTenHalfLivesCriterion).toBe(true);
    expect(e.meetsMassicCriterion).toBe(true);
    expect(e.meetsStorageReleaseCriteria).toBe(true);
    expect(e.blockingReasons).toHaveLength(0);
  });
  it('bloque si la masse est manquante', () => {
    const e = evaluateDecay(item({ mass: 0 }), after(180));
    expect(e.meetsMassicCriterion).toBe(false);
    expect(e.meetsStorageReleaseCriteria).toBe(false);
  });
  it('signale un radionucléide « autres » sans seuil renseigné', () => {
    const e = evaluateDecay(item({ radionuclide: 'autres', clearanceLevelBqPerG: undefined }), after(180));
    expect(e.clearanceLevelBqPerG).toBeNull();
    expect(e.meetsMassicCriterion).toBe(false);
  });
});

describe('evaluateExitControl', () => {
  it('refuse la sortie si le débit de dose dépasse le seuil', () => {
    const e = evaluateExitControl(item(), 5, after(180));
    expect(e.meetsDoseRateCriterion).toBe(false);
    expect(e.meetsAllCriteria).toBe(false);
  });
  it('autorise la sortie si tous les critères sont réunis', () => {
    const e = evaluateExitControl(item(), 0.1, after(180));
    expect(e.meetsDoseRateCriterion).toBe(true);
    expect(e.meetsAllCriteria).toBe(true);
  });
  it('refuse si le débit de dose est invalide', () => {
    const e = evaluateExitControl(item(), NaN, after(180));
    expect(e.meetsDoseRateCriterion).toBe(false);
  });
});
