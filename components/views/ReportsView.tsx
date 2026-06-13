'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, CalendarRange, CalendarDays, Boxes } from 'lucide-react';
import type { WasteItem } from '@/types';
import {
  residualActivityMBq,
  massicActivityBqPerG,
  theoreticalReleaseDate,
} from '@/lib/physics/decay';
import { SectionHeader } from '@/components/ui/Primitives';

type ReportName = 'REGISTRE' | 'MENSUEL' | 'ANNUEL' | 'INVENTAIRE';

interface ReportsViewProps {
  wasteItems: WasteItem[];
}

const MONTH_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const DEFAULT_FACILITY = 'Service de Médecine Nucléaire';

/** Formate une date ISO en date locale fr-FR, ou un repli si absente/invalide. */
function formatDateFr(iso: string | undefined, fallback = '-'): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString('fr-FR');
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
        <ReportCard onClick={() => handlePrint('MENSUEL')} icon={<CalendarRange className="h-6 w-6" aria-hidden="true" />} title="Rapport mensuel" description={`Éliminations de ${MONTH_LABELS[month]} ${year} (mode, conformité, visa).`} />
        <ReportCard onClick={() => handlePrint('ANNUEL')} icon={<CalendarDays className="h-6 w-6" aria-hidden="true" />} title="Rapport annuel" description={`Bilan ${year} : synthèse par radionucléide et détail des éliminations.`} />
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

const TH_CLASS = 'border border-gray-400 px-2 py-1 text-left text-xs font-semibold text-black';
const TD_CLASS = 'border border-gray-400 px-2 py-1 text-xs text-black';

function PrintRegistre({ wasteItems, facility }: { wasteItems: WasteItem[]; facility: string }) {
  return (
    <div className="p-8">
      <PrintHeader title="Registre Réglementaire des Déchets Radioactifs" facility={facility} />
      {wasteItems.length === 0 ? (
        <p className="text-xs text-black">Aucun déchet enregistré.</p>
      ) : (
        <table className="w-full border-collapse border border-gray-400">
          <thead>
            <tr>
              <th className={TH_CLASS}>Numéro</th>
              <th className={TH_CLASS}>Entrée</th>
              <th className={TH_CLASS}>Isotope</th>
              <th className={TH_CLASS}>Act. init (MBq)</th>
              <th className={TH_CLASS}>Statut</th>
              <th className={TH_CLASS}>Sortie</th>
            </tr>
          </thead>
          <tbody>
            {wasteItems.map((w) => (
              <tr key={w.id}>
                <td className={TD_CLASS}>{w.registryNumber ?? w.id}</td>
                <td className={TD_CLASS}>{formatDateFr(w.storageEntryDate)}</td>
                <td className={TD_CLASS}>{w.radionuclide}</td>
                <td className={TD_CLASS}>{w.initialActivity}</td>
                <td className={TD_CLASS}>{w.status}</td>
                <td className={TD_CLASS}>{formatDateFr(w.eliminationDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
        <table className="w-full border-collapse border border-gray-400">
          <thead>
            <tr>
              <th className={TH_CLASS}>ID</th>
              <th className={TH_CLASS}>Isotope</th>
              <th className={TH_CLASS}>Date entrée</th>
              <th className={TH_CLASS}>Activité résiduelle (MBq)</th>
              <th className={TH_CLASS}>Activité massique (Bq/g)</th>
              <th className={TH_CLASS}>Libération prévue</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((w) => {
              const residual = residualActivityMBq(w);
              const massic = massicActivityBqPerG(w);
              const release = theoreticalReleaseDate(w);
              return (
                <tr key={w.id}>
                  <td className={TD_CLASS}>{w.registryNumber ?? w.id}</td>
                  <td className={TD_CLASS}>{w.radionuclide}</td>
                  <td className={TD_CLASS}>{formatDateFr(w.storageEntryDate, '—')}</td>
                  <td className={TD_CLASS}>{residual !== null ? residual.toFixed(4) : '—'}</td>
                  <td className={TD_CLASS}>{massic !== null ? massic.toExponential(2) : '—'}</td>
                  <td className={TD_CLASS}>{release !== null ? release.toLocaleDateString('fr-FR') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
          <th className={TH_CLASS}>ID</th>
          <th className={TH_CLASS}>Date sortie</th>
          <th className={TH_CLASS}>Isotope</th>
          <th className={TH_CLASS}>Mode d&apos;élimination</th>
          <th className={TH_CLASS}>Conformité</th>
          <th className={TH_CLASS}>Visa / Signature</th>
        </tr>
      </thead>
      <tbody>
        {items.map((w) => (
          <tr key={w.id}>
            <td className={TD_CLASS}>{w.registryNumber ?? w.id}</td>
            <td className={TD_CLASS}>{formatDateFr(w.eliminationDate, '—')}</td>
            <td className={TD_CLASS}>{w.radionuclide}</td>
            <td className={TD_CLASS}>{w.eliminationMode ?? '—'}</td>
            <td className={TD_CLASS}>{w.exitConformity ? 'Conforme' : 'Dérogation'}</td>
            <td className={TD_CLASS}>{w.exitController ?? '—'}{w.exitSignedBy ? ` (${w.exitSignedBy})` : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PrintMensuel({ items, periodLabel, facility }: { items: WasteItem[]; periodLabel: string; facility: string }) {
  return (
    <div className="p-8">
      <PrintHeader title="Rapport Mensuel d'Élimination" subtitle={`Période : ${periodLabel}`} facility={facility} />
      <p className="mb-4 text-xs text-black">
        Total éliminé sur la période : <span className="font-semibold">{items.length}</span> déchet(s).
      </p>
      {items.length === 0 ? <p className="text-xs text-black">Aucune élimination sur cette période.</p> : <EliminationTable items={items} />}
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
      <p className="mb-4 text-xs text-black">
        Total éliminé sur l&apos;année : <span className="font-semibold">{items.length}</span> déchet(s).
      </p>

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
        </>
      )}
      <PrintSignature />
    </div>
  );
}
