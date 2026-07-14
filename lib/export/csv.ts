import type { WasteItem } from '@/types';
import {
  residualActivityMBq,
  massicActivityBqPerG,
  applicableClearanceLevel,
  netMassG,
  theoreticalReleaseHours,
  theoreticalReleaseDate,
  storageDurationHours,
  conformityIndex,
  netExitDoseRate,
  evaluateConformity,
} from '@/lib/physics/decay';

/** Échappe une valeur pour le format CSV (RFC 4180). */
function escapeCsv(value: string): string {
  if (/[",\n;]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Génère et télécharge un fichier CSV (séparateur point-virgule, compatible Excel FR),
 * précédé d'un BOM UTF-8 pour les caractères accentués.
 */
export function downloadCsv(fileName: string, headers: string[], rows: string[][]): void {
  const lines = [headers, ...rows].map((cols) => cols.map(escapeCsv).join(';'));
  const content = '﻿' + lines.join('\r\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(fileName, blob);
}

/** Génère et télécharge un fichier JSON indenté. */
export function downloadJson(fileName: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(fileName, blob);
}

function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Valeur d'une cellule d'export. `null` signifie DONNÉE ABSENTE : elle devient une cellule vide
 * en CSV et un `null` en JSON, jamais un zéro qui laisserait croire à une mesure effectuée.
 */
export type ExportValue = string | number | null;

export interface WasteExportColumn {
  /** Clé technique, utilisée comme nom de propriété dans l'export JSON. */
  key: string;
  header: string;
  value: (item: WasteItem, now: Date) => ExportValue;
  /** Rendu CSV, si la valeur brute demande un formatage particulier. */
  csv?: (value: ExportValue) => string;
}

function num(value: number | undefined): ExportValue {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: string | undefined): ExportValue {
  return value && value.trim() ? value : null;
}

function dateOnly(iso: string | undefined): ExportValue {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('fr-FR');
}

function dateTime(iso: string | undefined): ExportValue {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString('fr-FR');
}

/** Formateur CSV à décimales fixes ; cellule vide si la donnée est absente. */
function fixed(digits: number): (value: ExportValue) => string {
  return (value) => (typeof value === 'number' ? value.toFixed(digits) : '');
}

function scientific(value: ExportValue): string {
  return typeof value === 'number' ? value.toExponential(3) : '';
}

/** Libellé de la conformité CALCULÉE (jamais saisie) ; « INDÉTERMINÉ » tant qu'une donnée manque. */
export function computedConformityLabel(item: WasteItem, now: Date = new Date()): string {
  const { conforme } = evaluateConformity(item, now);
  if (conforme === null) return 'INDÉTERMINÉ';
  return conforme ? 'CONFORME' : 'NON CONFORME';
}

/**
 * Définition unique des colonnes de l'export ligne-par-déchet.
 * CSV, Excel et JSON en dérivent tous : un champ ajouté ici est présent dans les trois formats.
 */
export const WASTE_EXPORT_COLUMNS: WasteExportColumn[] = [
  // Identification
  { key: 'id', header: 'ID technique', value: (w) => w.id },
  { key: 'registryNumber', header: 'N° registre', value: (w) => text(w.registryNumber) },
  { key: 'createdAt', header: 'Créé le', value: (w) => dateOnly(w.createdAt) },
  { key: 'status', header: 'Statut', value: (w) => w.status },
  { key: 'type', header: 'Type', value: (w) => w.type },
  { key: 'radionuclide', header: 'Radionucléide', value: (w) => w.radionuclide },
  { key: 'originService', header: "Service d'origine", value: (w) => text(w.originService) },
  { key: 'responsibleOperator', header: 'Opérateur responsable', value: (w) => text(w.responsibleOperator) },

  // Radioactivité et mesures d'entrée
  { key: 'initialActivity', header: 'Activité initiale (MBq)', value: (w) => num(w.initialActivity) },
  { key: 'mass', header: 'Masse brute (g)', value: (w) => num(w.mass) },
  { key: 'containerTare', header: 'Tare du contenant (g)', value: (w) => num(w.containerTare) },
  { key: 'netMassG', header: 'Masse nette calculée (g)', value: (w) => netMassG(w), csv: fixed(2) },
  { key: 'halfLife', header: 'Demi-vie (h)', value: (w) => num(w.halfLife) },
  { key: 'measureDate', header: 'Date et heure de mesure', value: (w) => dateTime(w.measureDate) },
  { key: 'residualActivityMBq', header: 'Activité résiduelle calculée (MBq)', value: (w, now) => residualActivityMBq(w, now), csv: fixed(4) },
  { key: 'massicActivityBqPerG', header: 'Activité massique calculée (Bq/g)', value: (w, now) => massicActivityBqPerG(w, now), csv: scientific },
  { key: 'backgroundDoseRate', header: 'Bruit de fond du local (µSv/h)', value: (w) => num(w.backgroundDoseRate) },
  { key: 'doseRateContact', header: 'Débit de dose au contact (µSv/h)', value: (w) => num(w.doseRateContact) },
  { key: 'doseRate1m', header: 'Débit de dose à 1 m (µSv/h)', value: (w) => num(w.doseRate1m) },
  { key: 'clearanceLevelBqPerG', header: 'Niveau de libération (Bq/g)', value: (w) => num(w.clearanceLevelBqPerG) },
  { key: 'applicableClearanceLevelBqPerG', header: 'Niveau de libération applicable (Bq/g)', value: (w) => applicableClearanceLevel(w) },
  { key: 'releaseDoseThreshold', header: 'Seuil de dose pour libération (µSv/h)', value: (w) => num(w.releaseDoseThreshold) },
  { key: 'theoreticalReleaseDate', header: 'Date théorique de libération', value: (w) => dateOnly(theoreticalReleaseDate(w)?.toISOString()) },
  { key: 'theoreticalReleaseHours', header: 'Durée théorique de libération t_lib (h)', value: (w) => theoreticalReleaseHours(w), csv: fixed(2) },

  // Activité hospitalière du jour
  { key: 'dailyPatientCount', header: 'Patients du jour', value: (w) => num(w.dailyPatientCount) },
  { key: 'dailyElution', header: 'Élution du jour (MBq)', value: (w) => num(w.dailyElution) },
  { key: 'dailyExamTypes', header: 'Examens du jour', value: (w) => text((w.dailyExamTypes ?? []).join(' / ')) },

  // Stockage
  { key: 'storageEntryDate', header: 'Date entrée en stockage', value: (w) => dateTime(w.storageEntryDate) },
  { key: 'storageResponsible', header: 'Responsable du stockage', value: (w) => text(w.storageResponsible) },
  { key: 'expectedDecayDuration', header: 'Durée de décroissance attendue (jours)', value: (w) => num(w.expectedDecayDuration) },

  // Sortie et élimination
  { key: 'exitControlDate', header: 'Date du contrôle de sortie', value: (w) => dateTime(w.exitControlDate) },
  { key: 'exitBackgroundDoseRate', header: 'Bruit de fond à la sortie (µSv/h)', value: (w) => num(w.exitBackgroundDoseRate) },
  { key: 'exitDoseRate', header: 'Débit de dose de sortie au contact (µSv/h)', value: (w) => num(w.exitDoseRate) },
  { key: 'exitDoseRate1m', header: 'Débit de dose de sortie à 1 m (µSv/h)', value: (w) => num(w.exitDoseRate1m) },
  { key: 'netExitDoseRate', header: 'Débit de dose de sortie net du bruit de fond (µSv/h)', value: (w) => netExitDoseRate(w), csv: fixed(2) },
  { key: 'eliminationDate', header: 'Date de sortie / élimination', value: (w) => dateTime(w.eliminationDate) },
  { key: 'eliminationMode', header: "Mode d'élimination", value: (w) => text(w.eliminationMode) },
  { key: 'declaredConformity', header: 'Conformité déclarée', value: (w) => (w.status === 'elimine' ? (w.exitConformity === false ? 'Dérogation' : 'Conforme') : null) },
  { key: 'exitController', header: 'Contrôleur de sortie', value: (w) => text(w.exitController) },
  { key: 'eliminationResponsible', header: "Responsable de l'élimination", value: (w) => text(w.eliminationResponsible) },
  { key: 'exitSignedBy', header: 'Signature électronique (compte)', value: (w) => text(w.exitSignedBy) },

  // Conformité CALCULÉE (indicateur de preuve, jamais saisi)
  { key: 'storageDurationHours', header: 'Durée de stockage réelle (h)', value: (w) => storageDurationHours(w), csv: fixed(2) },
  { key: 'conformityIndex', header: 'Indice de conformité', value: (w) => conformityIndex(w), csv: fixed(3) },
  { key: 'computedConformity', header: 'Conformité calculée', value: (w, now) => computedConformityLabel(w, now) },
  { key: 'conformityMissingData', header: 'Données manquantes (conformité)', value: (w, now) => text(evaluateConformity(w, now).missing.join(' ; ')) },
];

/** En-têtes de l'export ligne-par-déchet. */
export function wasteExportHeaders(): string[] {
  return WASTE_EXPORT_COLUMNS.map((c) => c.header);
}

/** Lignes CSV/Excel : cellule vide (jamais « 0 ») quand la donnée est absente. */
export function wasteExportRows(items: WasteItem[], now: Date = new Date()): string[][] {
  return items.map((item) =>
    WASTE_EXPORT_COLUMNS.map((col) => {
      const value = col.value(item, now);
      if (col.csv) return col.csv(value);
      return value === null ? '' : String(value);
    }),
  );
}

/** Mêmes champs que le CSV, en objets (export JSON) : `null` quand la donnée est absente. */
export function wasteExportRecords(items: WasteItem[], now: Date = new Date()): Record<string, ExportValue>[] {
  return items.map((item) => {
    const record: Record<string, ExportValue> = {};
    for (const col of WASTE_EXPORT_COLUMNS) record[col.key] = col.value(item, now);
    return record;
  });
}

/** Dictionnaire clé technique → en-tête lisible, joint à l'export JSON. */
export function wasteExportFieldLabels(): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const col of WASTE_EXPORT_COLUMNS) labels[col.key] = col.header;
  return labels;
}
