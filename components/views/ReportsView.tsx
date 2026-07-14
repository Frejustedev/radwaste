'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, CalendarRange, CalendarDays, Boxes } from 'lucide-react';
import type { WasteItem } from '@/types';
import {
  residualActivityMBq,
  theoreticalReleaseDate,
  evaluateConformity,
  netExitDoseRate,
  type ConformityEvaluation,
} from '@/lib/physics/decay';
import { SectionHeader } from '@/components/ui/Primitives';
import { APP_VERSION, lastUpdatedFr } from '@/lib/version';

type ReportName = 'REGISTRE' | 'MENSUEL' | 'ANNUEL' | 'INVENTAIRE';

interface ReportsViewProps {
  wasteItems: WasteItem[];
}

const MONTH_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const DEFAULT_FACILITY = 'Service de Médecine Nucléaire';

/** Marque d'une donnée non relevée. Aucune valeur n'est jamais présumée à sa place. */
const EMPTY = '—';

/** Formate une date ISO en date locale fr-FR, ou un repli si absente/invalide. */
function formatDateFr(iso: string | undefined, fallback = '-'): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString('fr-FR');
}

/** Nombre décimal, ou tiret si la donnée est absente/incalculable. */
function fmtNumber(value: number | null | undefined, digits = 2): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return EMPTY;
  return value.toFixed(digits);
}

/** Activité massique et niveaux de libération : notation scientifique (ordres de grandeur très étalés). */
function fmtSci(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return EMPTY;
  return value.toExponential(2);
}

/** Durée en heures, complétée du jour équivalent au-delà de 24 h. */
function fmtHours(hours: number | null | undefined): string {
  if (typeof hours !== 'number' || !Number.isFinite(hours)) return EMPTY;
  const days = hours / 24;
  return days >= 1 ? `${hours.toFixed(1)} h (${days.toFixed(1)} j)` : `${hours.toFixed(1)} h`;
}

/** Verdict de conformité CALCULÉ. « Indéterminé » tant qu'une donnée du calcul manque. */
function conformityVerdict(conforme: boolean | null): string {
  if (conforme === null) return 'INDÉTERMINÉ';
  return conforme ? 'CONFORME' : 'NON CONFORME';
}

/** Conformité DÉCLARÉE par le contrôleur au contrôle de sortie (distincte du verdict calculé). */
function declaredConformity(w: WasteItem): string {
  if (typeof w.exitConformity !== 'boolean') return EMPTY;
  return w.exitConformity ? 'Conforme' : 'Dérogation PCR';
}

/**
 * Masse nette avec réserve : sans tare valide relevée, `netMassG` renvoie la masse BRUTE.
 * On ne présente alors jamais ce chiffre comme une vraie masse nette sans le signaler.
 */
function fmtNetMass(item: Pick<WasteItem, 'containerTare'>, netMass: number | null): string {
  if (typeof netMass !== 'number' || !Number.isFinite(netMass)) return EMPTY;
  const hasTare = typeof item.containerTare === 'number' && item.containerTare > 0;
  return hasTare ? fmtNumber(netMass) : `${fmtNumber(netMass)} (= brute, tare non renseignée)`;
}

/**
 * Indice de conformité affiché. Quand t_lib = 0 (activité massique déjà sous le seuil dès la mesure),
 * l'indice est null par construction MAIS le critère de durée est rempli d'office : on affiche
 * « sans objet », jamais un tiret qui laisserait croire à un critère non documenté à côté d'un CONFORME.
 */
function fmtConformityIndex(ev: Pick<ConformityEvaluation, 'tLibHours' | 'conformityIndex'>): string {
  if (ev.tLibHours === 0) return 'sans objet (t_lib = 0)';
  return fmtNumber(ev.conformityIndex);
}

/**
 * Verdict de conformité pour le REGISTRE. La conformité calculée est une preuve de sortie : tant que
 * le déchet n'est pas sorti (ni éliminé, ni passé au contrôle de sortie), elle est sans objet — on
 * affiche « en stockage » plutôt que « INDÉTERMINÉ », pour ne pas noyer le signal des déchets sortis.
 */
function registreConformity(w: WasteItem, conforme: boolean | null): string {
  const isExited = w.status === 'elimine' || Boolean(w.eliminationDate ?? w.exitControlDate);
  return isExited ? conformityVerdict(conforme) : 'en stockage (n.a.)';
}

/** Résumé compact du contexte d'activité du jour pour les rapports imprimés. */
function formatDailyContext(w: WasteItem): string {
  const parts: string[] = [];
  if (w.dailyPatientCount != null) parts.push(`${w.dailyPatientCount} pat.`);
  if (w.dailyElution != null) parts.push(`Élu. ${w.dailyElution} MBq`);
  if (w.dailyExamTypes?.length) parts.push(w.dailyExamTypes.join(', '));
  return parts.length > 0 ? parts.join(' · ') : '-';
}

export function ReportsView({ wasteItems }: ReportsViewProps) {
  const [printReport, setPrintReport] = useState<ReportName | null>(null);
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth()); // 0-11
  const [facility, setFacility] = useState<string>(DEFAULT_FACILITY);

  useEffect(() => {
    const handleAfterPrint = (): void => setPrintReport(null);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const handlePrint = (name: ReportName): void => {
    setPrintReport(name);
    setTimeout(() => window.print(), 100);
  };

  // En-tête réutilisé : l'établissement saisi, ou la valeur par défaut si vidé.
  const facilityName = facility.trim() || DEFAULT_FACILITY;

  // Années disponibles : celles présentes dans les éliminations + année courante.
  const years = useMemo(() => {
    const set = new Set<number>([today.getFullYear()]);
    for (const w of wasteItems) {
      if (w.eliminationDate) {
        const d = new Date(w.eliminationDate);
        if (!Number.isNaN(d.getTime())) set.add(d.getFullYear());
      }
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [wasteItems, today]);

  const monthlyItems = useMemo(
    () => wasteItems.filter((w) => {
      if (w.status !== 'elimine' || !w.eliminationDate) return false;
      const d = new Date(w.eliminationDate);
      return !Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month;
    }),
    [wasteItems, year, month],
  );

  const annualItems = useMemo(
    () => wasteItems.filter((w) => {
      if (w.status !== 'elimine' || !w.eliminationDate) return false;
      const d = new Date(w.eliminationDate);
      return !Number.isNaN(d.getTime()) && d.getFullYear() === year;
    }),
    [wasteItems, year],
  );

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <SectionHeader
          title="Rapports & Registres"
          description="Génération des documents réglementaires imprimables (PDF via l'impression du navigateur)."
        />
      </div>

      {/* Établissement — réutilisé dans l'en-tête de chaque rapport imprimé */}
      <div className="print:hidden">
        <label htmlFor="report-facility" className="block text-[11px] uppercase font-bold tracking-widest text-muted mb-1">
          Établissement
        </label>
        <input
          id="report-facility"
          type="text"
          value={facility}
          onChange={(e) => setFacility(e.target.value)}
          placeholder={DEFAULT_FACILITY}
          className="w-full max-w-md px-3 py-2 bg-surface-2 border border-subtle rounded-lg text-primary text-sm placeholder:text-faint"
        />
        <p className="mt-1 text-xs text-faint">Apparaît dans l&apos;en-tête de tous les rapports imprimés.</p>
      </div>

      {/* Sélecteur de période — pour les rapports mensuel et annuel */}
      <div className="flex flex-wrap items-end gap-4 print:hidden">
        <div>
          <label htmlFor="report-month" className="block text-[11px] uppercase font-bold tracking-widest text-muted mb-1">Mois (rapport mensuel)</label>
          <select
            id="report-month"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="px-3 py-2 bg-surface-2 border border-subtle rounded-lg text-primary text-sm"
          >
            {MONTH_LABELS.map((label, i) => <option key={label} value={i}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="report-year" className="block text-[11px] uppercase font-bold tracking-widest text-muted mb-1">Année</label>
          <select
            id="report-year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-2 bg-surface-2 border border-subtle rounded-lg text-primary text-sm"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Cartes de sélection — masquées à l'impression */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <ReportCard onClick={() => handlePrint('REGISTRE')} icon={<FileText className="h-6 w-6" aria-hidden="true" />} title="Registre réglementaire" description="Inventaire complet et historique de tous les déchets enregistrés." />
        <ReportCard onClick={() => handlePrint('MENSUEL')} icon={<CalendarRange className="h-6 w-6" aria-hidden="true" />} title="Rapport mensuel" description={`Éliminations de ${MONTH_LABELS[month]} ${year} avec fiches de preuve de conformité.`} />
        <ReportCard onClick={() => handlePrint('ANNUEL')} icon={<CalendarDays className="h-6 w-6" aria-hidden="true" />} title="Rapport annuel" description={`Bilan ${year} : synthèse par radionucléide et preuves de conformité.`} />
        <ReportCard onClick={() => handlePrint('INVENTAIRE')} icon={<Boxes className="h-6 w-6" aria-hidden="true" />} title="Inventaire du stock" description="Déchets en stockage ou libérables avec activité résiduelle." />
      </div>

      {/* Zone d'impression */}
      {printReport && (
        <div className="min-h-screen bg-white text-black">
          {printReport === 'REGISTRE' && <PrintRegistre wasteItems={wasteItems} facility={facilityName} />}
          {printReport === 'MENSUEL' && <PrintMensuel items={monthlyItems} periodLabel={`${MONTH_LABELS[month]} ${year}`} facility={facilityName} />}
          {printReport === 'ANNUEL' && <PrintAnnuel items={annualItems} year={year} facility={facilityName} />}
          {printReport === 'INVENTAIRE' && <PrintInventaire wasteItems={wasteItems} facility={facilityName} />}
        </div>
      )}
    </div>
  );
}

function ReportCard({ onClick, icon, title, description }: { onClick: () => void; icon: React.ReactNode; title: string; description: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-3 rounded-2xl border border-subtle bg-surface p-6 text-left transition hover:bg-surface-2"
    >
      <span className="rounded-xl bg-accent/10 p-3 text-accent">{icon}</span>
      <span className="text-base font-semibold text-primary">{title}</span>
      <span className="text-xs text-muted">{description}</span>
    </button>
  );
}

/** Trèfle radioactif EN NOIR (carré bordé), pour rester lisible en impression N&B. */
function PrintTrefoil({ size = 44 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded border border-black text-black"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" width={size * 0.66} height={size * 0.66} fill="currentColor" role="img">
        <circle cx="50" cy="50" r="9" />
        {[0, 120, 240].map((angle) => (
          <path
            key={angle}
            d="M50 50 L67.3 80 A35 35 0 0 0 32.7 80 Z"
            transform={`rotate(${angle} 50 50)`}
          />
        ))}
      </svg>
    </span>
  );
}

/** En-tête commun aux documents imprimés : logo N&B, établissement, titre et date de génération. */
function PrintHeader({ title, subtitle, facility }: { title: string; subtitle?: string; facility: string }) {
  return (
    <div className="mb-6 border-b border-gray-400 pb-4">
      <div className="flex items-start gap-3">
        <PrintTrefoil />
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wide text-black">{facility}</p>
          <h1 className="mt-0.5 text-xl font-bold text-black">{title}</h1>
          {subtitle && <p className="mt-1 text-sm font-semibold text-black">{subtitle}</p>}
          <p className="mt-1 text-xs text-black">Document généré le {new Date().toLocaleString('fr-FR')}</p>
          <p className="text-xs text-black">RadWaste IMENA — version {APP_VERSION} (mise à jour du {lastUpdatedFr()})</p>
        </div>
      </div>
    </div>
  );
}

function PrintSignature() {
  return (
    <div className="mt-12 flex justify-end">
      <div className="w-64 border-t border-gray-400 pt-2 text-center text-xs text-black">
        Personne Compétente en Radioprotection (PCR)
      </div>
    </div>
  );
}

/** Légende rappelant que les cases sans valeur ne sont jamais comblées par un zéro. */
function PrintLegend() {
  return (
    <div className="mt-2 space-y-0.5 text-[10px] text-black">
      <p>
        {EMPTY} : donnée non relevée — aucune valeur n&apos;est présumée. Conformité CALCULÉE à partir des mesures
        enregistrées (activité massique ≤ niveau de libération ET indice de conformité ≥ 1), jamais saisie.
      </p>
      <p>
        « sans objet (t_lib = 0) » : aucune attente n&apos;était requise (activité massique déjà sous le seuil dès la
        mesure) ; l&apos;indice de conformité est alors sans objet, mais le critère de durée reste rempli.
      </p>
      <p>
        « (= brute, tare non renseignée) » : la tare du contenant n&apos;a pas été relevée ; la masse nette affichée
        est en réalité la masse brute.
      </p>
      <p>
        « en stockage (n.a.) » : déchet non encore sorti ; la conformité calculée est une preuve de sortie, sans
        objet tant que le déchet reste en stock.
      </p>
    </div>
  );
}

const TH_CLASS = 'border border-gray-400 px-2 py-1 text-left text-xs font-semibold text-black';
const TD_CLASS = 'border border-gray-400 px-2 py-1 text-xs text-black';
// Tableaux larges (preuve de conformité) : même trame, densité réduite pour tenir en A4 portrait.
const TH_DENSE = 'border border-gray-400 px-1.5 py-1 text-left text-[10px] font-semibold text-black';
const TD_DENSE = 'border border-gray-400 px-1.5 py-1 text-[10px] text-black tabular';

/** Une ligne étiquette / valeur d'une fiche de preuve. */
function FicheRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 py-0.5">
      <span className="text-[10px] text-black">{label}</span>
      <span className="tabular text-[10px] font-semibold text-black">{value}</span>
    </div>
  );
}

/**
 * Fiche de preuve de conformité d'un déchet : mesures relevées (masses, bruit de fond, débits de dose
 * d'entrée et de sortie) et indicateurs CALCULÉS (activité massique, t_lib, indice, verdict).
 */
function ConformityFiche({ item }: { item: WasteItem }) {
  const ev = evaluateConformity(item);
  // « Net » n'a de sens que si le bruit de fond de sortie a été relevé : sinon netExitDoseRate
  // renvoie la valeur BRUTE (présomption d'un bruit de fond nul). On n'affiche alors pas de net.
  const hasExitBackground =
    typeof item.exitBackgroundDoseRate === 'number' && Number.isFinite(item.exitBackgroundDoseRate);
  const netExit = netExitDoseRate(item);

  return (
    <div className="mb-4 break-inside-avoid border border-gray-400 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-gray-300 pb-1">
        <p className="text-xs font-bold text-black">
          Fiche n° {item.registryNumber ?? item.id} — {item.radionuclide} — {item.type}
        </p>
        <p className="text-[10px] text-black">
          Sortie : {formatDateFr(item.eliminationDate ?? item.exitControlDate, EMPTY)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <FicheRow label="Masse brute (g)" value={fmtNumber(item.mass)} />
          <FicheRow label="Tare du contenant (g)" value={fmtNumber(item.containerTare)} />
          <FicheRow label="Masse nette (g)" value={fmtNetMass(item, ev.netMassG)} />
          <FicheRow label="Activité initiale (MBq)" value={fmtNumber(item.initialActivity)} />
          <FicheRow label="Date de mesure" value={formatDateFr(item.measureDate, EMPTY)} />
          <FicheRow label="Bruit de fond du local à la mesure (µSv/h)" value={fmtNumber(item.backgroundDoseRate)} />
          <FicheRow label="Débit de dose au contact, entrée (µSv/h)" value={fmtNumber(item.doseRateContact)} />
          <FicheRow label="Débit de dose à 1 m, entrée (µSv/h)" value={fmtNumber(item.doseRate1m)} />
          <FicheRow label="Entrée en stockage" value={formatDateFr(item.storageEntryDate, EMPTY)} />
        </div>
        <div>
          <FicheRow label="Bruit de fond du local à la sortie (µSv/h)" value={fmtNumber(item.exitBackgroundDoseRate)} />
          <FicheRow label="Débit de dose de sortie au contact (µSv/h)" value={fmtNumber(item.exitDoseRate)} />
          <FicheRow
            label="Sortie au contact, net du bruit de fond (µSv/h)"
            value={hasExitBackground ? fmtNumber(netExit) : EMPTY}
          />
          <FicheRow label="Débit de dose de sortie à 1 m (µSv/h)" value={fmtNumber(item.exitDoseRate1m)} />
          <FicheRow label="Activité massique (Bq/g)" value={fmtSci(ev.massicBqPerG)} />
          <FicheRow label="Niveau de libération applicable (Bq/g)" value={fmtSci(ev.clearanceLevelBqPerG)} />
          <FicheRow label="Durée théorique de libération (t_lib)" value={fmtHours(ev.tLibHours)} />
          <FicheRow label="Durée de stockage réelle" value={fmtHours(ev.storageHours)} />
          <FicheRow label="Indice de conformité (stockage / t_lib)" value={fmtConformityIndex(ev)} />
        </div>
      </div>

      <div className="mt-2 border-t border-gray-300 pt-2 text-black">
        <p className="text-xs">
          <span className="font-semibold">Conformité calculée : </span>
          <span className="font-bold">{conformityVerdict(ev.conforme)}</span>
        </p>
        {ev.conforme === null && ev.missing.length > 0 && (
          <p className="mt-0.5 text-[10px]">Données manquantes : {ev.missing.join(' · ')}</p>
        )}
        <p className="mt-0.5 text-[10px]">
          Conformité déclarée par le contrôleur : {declaredConformity(item)} — Contrôleur : {item.exitController ?? EMPTY}
          {item.exitSignedBy ? ` (${item.exitSignedBy})` : ''}
        </p>
      </div>
    </div>
  );
}

/** Répartition des verdicts calculés sur un lot de déchets. */
function ConformitySummary({ items }: { items: WasteItem[] }) {
  let conformes = 0;
  let nonConformes = 0;
  let indetermines = 0;
  for (const w of items) {
    const { conforme } = evaluateConformity(w);
    if (conforme === null) indetermines += 1;
    else if (conforme) conformes += 1;
    else nonConformes += 1;
  }
  return (
    <p className="mb-4 text-xs text-black">
      Conformité calculée : <span className="font-semibold">{conformes}</span> conforme(s) ·{' '}
      <span className="font-semibold">{nonConformes}</span> non conforme(s) ·{' '}
      <span className="font-semibold">{indetermines}</span> indéterminé(s).
    </p>
  );
}

/** Section « fiches » : une fiche de preuve par déchet du lot. */
function ConformityFiches({ items }: { items: WasteItem[] }) {
  return (
    <>
      <h2 className="mt-8 mb-2 text-sm font-bold text-black">Fiches de preuve de conformité</h2>
      <p className="mb-3 text-[10px] text-black">
        Mesures relevées et indicateurs calculés, déchet par déchet. Un {EMPTY} signale une donnée non relevée :
        aucune valeur n&apos;est présumée à sa place.
      </p>
      {items.map((w) => <ConformityFiche key={w.id} item={w} />)}
    </>
  );
}

function PrintRegistre({ wasteItems, facility }: { wasteItems: WasteItem[]; facility: string }) {
  return (
    <div className="p-8">
      <PrintHeader title="Registre Réglementaire des Déchets Radioactifs" facility={facility} />
      {wasteItems.length === 0 ? (
        <p className="text-xs text-black">Aucun déchet enregistré.</p>
      ) : (
        <>
          <table className="w-full border-collapse border border-gray-400">
            <thead>
              <tr>
                <th className={TH_DENSE}>Numéro</th>
                <th className={TH_DENSE}>Entrée</th>
                <th className={TH_DENSE}>Isotope</th>
                <th className={TH_DENSE}>Act. init (MBq)</th>
                <th className={TH_DENSE}>Masse brute (g)</th>
                <th className={TH_DENSE}>Tare (g)</th>
                <th className={TH_DENSE}>Masse nette (g)</th>
                <th className={TH_DENSE}>Act. massique (Bq/g)</th>
                <th className={TH_DENSE}>Niveau lib. (Bq/g)</th>
                <th className={TH_DENSE}>Statut</th>
                <th className={TH_DENSE}>Sortie</th>
                <th className={TH_DENSE}>Conformité calculée</th>
                <th className={TH_DENSE}>Activité du jour</th>
              </tr>
            </thead>
            <tbody>
              {wasteItems.map((w) => {
                const ev = evaluateConformity(w);
                return (
                  <tr key={w.id}>
                    <td className={TD_DENSE}>{w.registryNumber ?? w.id}</td>
                    <td className={TD_DENSE}>{formatDateFr(w.storageEntryDate, EMPTY)}</td>
                    <td className={TD_DENSE}>{w.radionuclide}</td>
                    <td className={TD_DENSE}>{fmtNumber(w.initialActivity)}</td>
                    <td className={TD_DENSE}>{fmtNumber(w.mass)}</td>
                    <td className={TD_DENSE}>{fmtNumber(w.containerTare)}</td>
                    <td className={TD_DENSE}>{fmtNetMass(w, ev.netMassG)}</td>
                    <td className={TD_DENSE}>{fmtSci(ev.massicBqPerG)}</td>
                    <td className={TD_DENSE}>{fmtSci(ev.clearanceLevelBqPerG)}</td>
                    <td className={TD_DENSE}>{w.status}</td>
                    <td className={TD_DENSE}>{formatDateFr(w.eliminationDate, EMPTY)}</td>
                    <td className={`${TD_DENSE} font-bold`}>{registreConformity(w, ev.conforme)}</td>
                    <td className={TD_DENSE}>{formatDailyContext(w)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <PrintLegend />
        </>
      )}
      <PrintSignature />
    </div>
  );
}

function PrintInventaire({ wasteItems, facility }: { wasteItems: WasteItem[]; facility: string }) {
  const stock = wasteItems.filter((w) => w.status === 'stockage' || w.status === 'liberable');
  return (
    <div className="p-8">
      <PrintHeader title="Inventaire du Stock de Déchets Radioactifs" facility={facility} />
      <p className="mb-4 text-xs text-black">
        Total en stock : <span className="font-semibold">{stock.length}</span> déchet(s).
      </p>
      {stock.length === 0 ? (
        <p className="text-xs text-black">Aucun déchet en stock.</p>
      ) : (
        <>
          <table className="w-full border-collapse border border-gray-400">
            <thead>
              <tr>
                <th className={TH_DENSE}>ID</th>
                <th className={TH_DENSE}>Isotope</th>
                <th className={TH_DENSE}>Date entrée</th>
                <th className={TH_DENSE}>Masse nette (g)</th>
                <th className={TH_DENSE}>Activité résiduelle (MBq)</th>
                <th className={TH_DENSE}>Activité massique (Bq/g)</th>
                <th className={TH_DENSE}>Niveau lib. (Bq/g)</th>
                <th className={TH_DENSE}>t_lib</th>
                <th className={TH_DENSE}>Libération prévue</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((w) => {
                const ev = evaluateConformity(w);
                const residual = residualActivityMBq(w);
                const release = theoreticalReleaseDate(w);
                return (
                  <tr key={w.id}>
                    <td className={TD_DENSE}>{w.registryNumber ?? w.id}</td>
                    <td className={TD_DENSE}>{w.radionuclide}</td>
                    <td className={TD_DENSE}>{formatDateFr(w.storageEntryDate, EMPTY)}</td>
                    <td className={TD_DENSE}>{fmtNetMass(w, ev.netMassG)}</td>
                    <td className={TD_DENSE}>{fmtNumber(residual, 4)}</td>
                    <td className={TD_DENSE}>{fmtSci(ev.massicBqPerG)}</td>
                    <td className={TD_DENSE}>{fmtSci(ev.clearanceLevelBqPerG)}</td>
                    <td className={TD_DENSE}>{fmtHours(ev.tLibHours)}</td>
                    <td className={TD_DENSE}>{release !== null ? release.toLocaleDateString('fr-FR') : EMPTY}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <PrintLegend />
        </>
      )}
      <PrintSignature />
    </div>
  );
}

function EliminationTable({ items }: { items: WasteItem[] }) {
  return (
    <table className="w-full border-collapse border border-gray-400">
      <thead>
        <tr>
          <th className={TH_DENSE}>ID</th>
          <th className={TH_DENSE}>Date sortie</th>
          <th className={TH_DENSE}>Isotope</th>
          <th className={TH_DENSE}>Mode d&apos;élimination</th>
          <th className={TH_DENSE}>Masse nette (g)</th>
          <th className={TH_DENSE}>Act. massique (Bq/g)</th>
          <th className={TH_DENSE}>Niveau lib. (Bq/g)</th>
          <th className={TH_DENSE}>Sortie contact (µSv/h)</th>
          <th className={TH_DENSE}>Sortie 1 m (µSv/h)</th>
          <th className={TH_DENSE}>Indice conf.</th>
          <th className={TH_DENSE}>Conformité calculée</th>
          <th className={TH_DENSE}>Conformité déclarée</th>
          <th className={TH_DENSE}>Visa / Signature</th>
        </tr>
      </thead>
      <tbody>
        {items.map((w) => {
          const ev = evaluateConformity(w);
          return (
            <tr key={w.id}>
              <td className={TD_DENSE}>{w.registryNumber ?? w.id}</td>
              <td className={TD_DENSE}>{formatDateFr(w.eliminationDate, EMPTY)}</td>
              <td className={TD_DENSE}>{w.radionuclide}</td>
              <td className={TD_DENSE}>{w.eliminationMode ?? EMPTY}</td>
              <td className={TD_DENSE}>{fmtNetMass(w, ev.netMassG)}</td>
              <td className={TD_DENSE}>{fmtSci(ev.massicBqPerG)}</td>
              <td className={TD_DENSE}>{fmtSci(ev.clearanceLevelBqPerG)}</td>
              <td className={TD_DENSE}>{fmtNumber(w.exitDoseRate)}</td>
              <td className={TD_DENSE}>{fmtNumber(w.exitDoseRate1m)}</td>
              <td className={TD_DENSE}>{fmtConformityIndex(ev)}</td>
              <td className={`${TD_DENSE} font-bold`}>{conformityVerdict(ev.conforme)}</td>
              <td className={TD_DENSE}>{declaredConformity(w)}</td>
              <td className={TD_DENSE}>{w.exitController ?? EMPTY}{w.exitSignedBy ? ` (${w.exitSignedBy})` : ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PrintMensuel({ items, periodLabel, facility }: { items: WasteItem[]; periodLabel: string; facility: string }) {
  return (
    <div className="p-8">
      <PrintHeader title="Rapport Mensuel d'Élimination" subtitle={`Période : ${periodLabel}`} facility={facility} />
      <p className="mb-1 text-xs text-black">
        Total éliminé sur la période : <span className="font-semibold">{items.length}</span> déchet(s).
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-black">Aucune élimination sur cette période.</p>
      ) : (
        <>
          <ConformitySummary items={items} />
          <EliminationTable items={items} />
          <PrintLegend />
          <ConformityFiches items={items} />
        </>
      )}
      <PrintSignature />
    </div>
  );
}

function PrintAnnuel({ items, year, facility }: { items: WasteItem[]; year: number; facility: string }) {
  // Synthèse par radionucléide : nombre éliminé + activité initiale cumulée.
  const summary = new Map<string, { count: number; totalActivity: number }>();
  for (const w of items) {
    const entry = summary.get(w.radionuclide) ?? { count: 0, totalActivity: 0 };
    entry.count += 1;
    entry.totalActivity += typeof w.initialActivity === 'number' ? w.initialActivity : 0;
    summary.set(w.radionuclide, entry);
  }
  const rows = Array.from(summary.entries());

  return (
    <div className="p-8">
      <PrintHeader title="Rapport Annuel des Déchets Radioactifs" subtitle={`Année : ${year}`} facility={facility} />
      <p className="mb-1 text-xs text-black">
        Total éliminé sur l&apos;année : <span className="font-semibold">{items.length}</span> déchet(s).
      </p>
      {items.length > 0 && <ConformitySummary items={items} />}

      <h2 className="mb-2 text-sm font-bold text-black">Synthèse par radionucléide</h2>
      {rows.length === 0 ? (
        <p className="mb-6 text-xs text-black">Aucune élimination sur l&apos;année.</p>
      ) : (
        <table className="mb-8 w-full border-collapse border border-gray-400">
          <thead>
            <tr>
              <th className={TH_CLASS}>Radionucléide</th>
              <th className={TH_CLASS}>Nombre éliminé</th>
              <th className={TH_CLASS}>Activité initiale cumulée (MBq)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([rn, agg]) => (
              <tr key={rn}>
                <td className={TD_CLASS}>{rn}</td>
                <td className={TD_CLASS}>{agg.count}</td>
                <td className={TD_CLASS}>{agg.totalActivity.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {items.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-bold text-black">Détail des éliminations</h2>
          <EliminationTable items={items} />
          <PrintLegend />
          <ConformityFiches items={items} />
        </>
      )}
      <PrintSignature />
    </div>
  );
}
