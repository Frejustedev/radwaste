import { describe, it, expect } from 'vitest';
import type { WasteItem } from '@/types';
import {
  netMassG,
  massicActivityBqPerG,
  theoreticalReleaseHours,
  theoreticalReleaseDate,
  storageDurationHours,
  conformityIndex,
  conformityInstant,
  evaluateConformity,
  netExitDoseRate,
} from './decay';

/**
 * Conformité au « Dictionnaire de données — RadWaste v2 » (annexe 3 du mémoire) :
 *   masse nette          = masse_brute_g − tare_g
 *   activite_massique    = activite_residuelle_MBq × 1e6 / masse nette
 *   t_lib_theorique_h    = 8,666 × ln[A0 × 1e6 / (100 × masse nette)]   (spécialisé Tc-99m)
 *   duree_stockage_h     = datetime_sortie − datetime_entree_stockage
 *   indice_conformite    = duree_stockage_h / t_lib_theorique_h
 *   conforme             = activite_massique ≤ 100 ET indice_conformite ≥ 1  (CALCULÉ)
 */

const base = '2024-01-01T00:00:00.000Z';
const after = (hours: number) => new Date(new Date(base).getTime() + hours * 3_600_000);

function item(partial: Partial<WasteItem> = {}): WasteItem {
  return {
    id: 'WST-CONF-001',
    createdAt: base,
    type: 'solide',
    hospitalId: 'h1',
    radionuclide: 'Tc-99m',
    halfLife: 6.0067,
    initialActivity: 1000, // MBq
    mass: 1000, // g brut
    containerTare: 200, // g -> masse nette 800 g
    measureDate: base,
    storageEntryDate: base,
    status: 'stockage',
    ...partial,
  };
}

describe('netMassG — masse nette', () => {
  it('soustrait la tare de la masse brute', () => {
    expect(netMassG({ mass: 1000, containerTare: 200 })).toBe(800);
  });
  it('retombe sur la masse brute quand la tare est absente (enregistrements historiques)', () => {
    expect(netMassG({ mass: 1000 })).toBe(1000);
    expect(netMassG({ mass: 1000, containerTare: 0 })).toBe(1000);
  });
  it('renvoie null si la tare annule ou dépasse la masse brute', () => {
    expect(netMassG({ mass: 500, containerTare: 500 })).toBeNull();
    expect(netMassG({ mass: 500, containerTare: 700 })).toBeNull();
  });
  it('renvoie null sans masse brute exploitable', () => {
    expect(netMassG({})).toBeNull();
    expect(netMassG({ mass: 0 })).toBeNull();
  });
});

describe('massicActivityBqPerG — divise par la masse NETTE', () => {
  it('utilise la masse nette et non la masse brute', () => {
    // 1000 MBq = 1e9 Bq sur 800 g nets -> 1 250 000 Bq/g
    expect(massicActivityBqPerG(item(), after(0))).toBeCloseTo(1e9 / 800, 3);
  });
  it('conserve le comportement historique quand aucune tare n’est saisie', () => {
    expect(massicActivityBqPerG(item({ containerTare: undefined }), after(0))).toBeCloseTo(1e9 / 1000, 3);
  });
});

describe('theoreticalReleaseHours — t_lib', () => {
  it('reproduit la formule du dictionnaire 8,666 × ln[A0×1e6 / (100 × masse nette)] pour le Tc-99m', () => {
    const attendu = 8.666 * Math.log((1000 * 1e6) / (100 * 800));
    const calcule = theoreticalReleaseHours(item());
    expect(calcule).not.toBeNull();
    expect(calcule as number).toBeCloseTo(attendu, 1);
  });

  it('se généralise à un autre radionucléide (I-131 : T½ = 192,6 h, seuil 100 Bq/g)', () => {
    const w = item({ radionuclide: 'I-131', halfLife: 192.6 });
    const attendu = (192.6 / Math.LN2) * Math.log((1000 * 1e6) / (100 * 800));
    expect(theoreticalReleaseHours(w) as number).toBeCloseTo(attendu, 6);
  });

  it('renvoie 0 lorsque le déchet est déjà sous le seuil dès la mesure initiale', () => {
    // 0,00001 MBq = 10 Bq sur 800 g -> 0,0125 Bq/g, très en dessous de 100 Bq/g
    expect(theoreticalReleaseHours(item({ initialActivity: 0.00001 }))).toBe(0);
  });

  it('renvoie null dès qu’une donnée manque', () => {
    expect(theoreticalReleaseHours(item({ initialActivity: undefined }))).toBeNull();
    expect(theoreticalReleaseHours(item({ mass: undefined }))).toBeNull();
    expect(theoreticalReleaseHours(item({ halfLife: undefined }))).toBeNull();
    expect(theoreticalReleaseHours(item({ radionuclide: 'autres' }))).toBeNull();
  });

  it('reste cohérent avec theoreticalReleaseDate', () => {
    const w = item();
    const h = theoreticalReleaseHours(w) as number;
    const d = theoreticalReleaseDate(w) as Date;
    expect(d.getTime()).toBeCloseTo(new Date(base).getTime() + h * 3_600_000, -2);
  });
});

describe('storageDurationHours — durée de stockage réelle', () => {
  it('mesure entrée → sortie, la date d’élimination primant', () => {
    expect(storageDurationHours({ storageEntryDate: base, eliminationDate: after(72).toISOString() })).toBeCloseTo(72, 6);
  });
  it('retombe sur la date de contrôle de sortie à défaut d’élimination', () => {
    expect(storageDurationHours({ storageEntryDate: base, exitControlDate: after(48).toISOString() })).toBeCloseTo(48, 6);
  });
  it('renvoie null si la sortie précède l’entrée (incohérence de saisie)', () => {
    expect(storageDurationHours({ storageEntryDate: after(10).toISOString(), eliminationDate: base })).toBeNull();
  });
  it('renvoie null si une date manque', () => {
    expect(storageDurationHours({ eliminationDate: base })).toBeNull();
    expect(storageDurationHours({ storageEntryDate: base })).toBeNull();
  });
});

describe('conformityIndex / evaluateConformity', () => {
  // t_lib ≈ 8,666 × ln(1e9 / 80 000) ≈ 81,7 h
  const stockeAssezLongtemps = () => item({ eliminationDate: after(120).toISOString() });

  it('indice = durée de stockage / t_lib', () => {
    const w = stockeAssezLongtemps();
    const tLib = theoreticalReleaseHours(w) as number;
    expect(conformityIndex(w)).toBeCloseTo(120 / tLib, 6);
  });

  it('déclare CONFORME quand activité massique ≤ seuil ET indice ≥ 1', () => {
    const r = evaluateConformity(stockeAssezLongtemps(), after(120));
    expect(r.netMassG).toBe(800);
    expect(r.conformityIndex as number).toBeGreaterThanOrEqual(1);
    expect(r.meetsMassicCriterion).toBe(true);
    expect(r.meetsDurationCriterion).toBe(true);
    expect(r.conforme).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('déclare NON CONFORME un déchet sorti trop tôt (indice < 1)', () => {
    const w = item({ eliminationDate: after(24).toISOString() });
    const r = evaluateConformity(w, after(24));
    expect(r.conformityIndex as number).toBeLessThan(1);
    expect(r.meetsDurationCriterion).toBe(false);
    expect(r.conforme).toBe(false);
  });

  it('n’affirme JAMAIS la conformité quand une donnée manque (null, jamais false)', () => {
    const r = evaluateConformity(item({ initialActivity: undefined, eliminationDate: after(120).toISOString() }), after(120));
    expect(r.conforme).toBeNull();
    expect(r.missing).toContain('Activité initiale (MBq)');
  });

  it('signale l’absence de date de sortie', () => {
    const r = evaluateConformity(item(), after(120));
    expect(r.conforme).toBeNull();
    expect(r.missing).toContain('Date de sortie');
  });

  it('remplit le critère de durée d’office quand t_lib = 0 (aucune attente requise)', () => {
    const w = item({ initialActivity: 0.00001, eliminationDate: after(1).toISOString() });
    const r = evaluateConformity(w, after(1));
    expect(r.tLibHours).toBe(0);
    expect(r.conformityIndex).toBeNull(); // rapport indéfini : division par zéro évitée
    expect(r.meetsDurationCriterion).toBe(true);
    expect(r.conforme).toBe(true);
  });

  it('signale l’absence de date de mesure (verdict jamais « conforme » muet)', () => {
    const r = evaluateConformity(item({ measureDate: undefined, eliminationDate: after(120).toISOString() }), after(120));
    expect(r.conforme).toBeNull();
    expect(r.missing).toContain('Date de mesure');
  });

  it('NE DÉCLARE PAS conforme un déchet sorti au-dessus du seuil, même évalué longtemps après (activité massique figée à la sortie)', () => {
    // Scénario de sécurité clinique : entrée en stock antidatée (t0 − 100 h), mesure à t0,
    // sortie 5 h après la mesure. La durée de stockage (105 h) dépasse t_lib (≈ 20 h) donc
    // l'indice ≥ 1 ; MAIS à la sortie l'activité massique valait ≈ 562 Bq/g, très au-dessus du
    // seuil de 100 Bq/g : le déchet N'ÉTAIT PAS libérable. Évalué des semaines plus tard,
    // l'activité massique « à now » serait ≈ 0 et ferait passer le critère : c'est le faux
    // CONFORME que la date de sortie figée doit empêcher.
    const measure = base; // t0
    const w = item({
      radionuclide: 'Tc-99m', halfLife: 6.0067, initialActivity: 1, // 1 MBq
      mass: 1000, containerTare: undefined, clearanceLevelBqPerG: undefined, // massique initiale 1000 Bq/g
      measureDate: measure,
      storageEntryDate: after(-100).toISOString(),
      eliminationDate: after(5).toISOString(),
    });
    // Évalué 30 jours après la sortie :
    const bienPlusTard = new Date(new Date(base).getTime() + 30 * 24 * 3_600_000);
    const r = evaluateConformity(w, bienPlusTard);
    expect(r.conformityIndex as number).toBeGreaterThanOrEqual(1); // durée OK
    expect(r.massicBqPerG as number).toBeGreaterThan(100);         // mais massique à la sortie > seuil
    expect(r.meetsMassicCriterion).toBe(false);
    expect(r.conforme).toBe(false);                                // et NON l'inverse
  });
});

describe('conformityInstant — date d’évaluation figée', () => {
  const now = after(1000);
  it('utilise la date d’élimination pour un déchet sorti', () => {
    expect(conformityInstant({ eliminationDate: after(50).toISOString() }, now).getTime()).toBe(after(50).getTime());
  });
  it('retombe sur la date de contrôle de sortie à défaut d’élimination', () => {
    expect(conformityInstant({ exitControlDate: after(40).toISOString() }, now).getTime()).toBe(after(40).getTime());
  });
  it('utilise « now » pour un déchet encore en stock', () => {
    expect(conformityInstant({}, now).getTime()).toBe(now.getTime());
  });
});

describe('netExitDoseRate — débit de dose de sortie net du bruit de fond', () => {
  it('soustrait le bruit de fond du local', () => {
    expect(netExitDoseRate({ exitDoseRate: 0.9, exitBackgroundDoseRate: 0.2 })).toBeCloseTo(0.7, 6);
  });
  it('ne descend jamais sous zéro', () => {
    expect(netExitDoseRate({ exitDoseRate: 0.1, exitBackgroundDoseRate: 0.3 })).toBe(0);
  });
  it('renvoie la mesure brute si le bruit de fond n’est pas relevé', () => {
    expect(netExitDoseRate({ exitDoseRate: 0.4 })).toBe(0.4);
  });
  it('renvoie null en l’absence de mesure de sortie', () => {
    expect(netExitDoseRate({})).toBeNull();
  });
});
