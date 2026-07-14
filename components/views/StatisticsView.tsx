'use client';

import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Download, FileSpreadsheet, FileJson, Printer, Boxes, Activity, CheckCircle2, ShieldAlert, AlertTriangle, Users2 } from 'lucide-react';
import type { WasteItem, Incident, User, AppSettings } from '@/types';
import { computeStats, statsToCsvRows, type CompletenessStat } from '@/lib/stats/compute';
import {
  downloadCsv, downloadJson, wasteExportHeaders, wasteExportRows,
  wasteExportRecords, wasteExportFieldLabels,
} from '@/lib/export/csv';
import { writeLog } from '@/lib/repositories/logRepository';
import { KPICard, SectionHeader } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';

interface StatisticsViewProps {
  wasteItems: WasteItem[];
  incidents: Incident[];
  profile: User;
  settings: AppSettings;
  theme: 'dark' | 'light';
}

const PALETTE = ['#FACC15', '#22C55E', '#3B82F6', '#A855F7', '#64748B', '#EF4444', '#14B8A6', '#F97316', '#EC4899', '#84CC16'];

/** Valeur numérique formatée, ou tiret cadratin si la donnée est absente (jamais « 0 »). */
function fmtNum(value: number | null, digits = 1, suffix = ''): string {
  return value !== null ? `${value.toFixed(digits)}${suffix}` : '—';
}

/** « 3 (75 %) » — le taux disparaît quand le périmètre est vide, faute de dénominateur. */
function countWithRate(count: number, rate: number | null): string {
  return rate !== null ? `${count} (${rate.toFixed(0)} %)` : String(count);
}

export function StatisticsView({ wasteItems, incidents, profile, settings, theme }: StatisticsViewProps) {
  const { success } = useToast();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [radionuclide, setRadionuclide] = useState('');
  const [status, setStatus] = useState('');
  const [examType, setExamType] = useState('');

  const axisStroke = theme === 'light' ? '#475569' : '#64748b';
  const gridStroke = theme === 'light' ? '#cbd5e1' : '#334155';
  const tooltipStyle = theme === 'light'
    ? { backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, color: '#0f172a' }
    : { backgroundColor: '#0D0E12', border: '1px solid #334155', borderRadius: 8, color: '#e0e2e5' };

  const startTs = start ? new Date(start).getTime() : null;
  const endTs = end ? new Date(end).getTime() + 86_400_000 : null; // inclure le jour de fin

  const filteredWaste = useMemo(() => wasteItems.filter((w) => {
    if (radionuclide && w.radionuclide !== radionuclide) return false;
    if (status && w.status !== status) return false;
    if (examType && !(w.dailyExamTypes ?? []).includes(examType)) return false;
    if (startTs !== null || endTs !== null) {
      const t = w.createdAt ? new Date(w.createdAt).getTime() : NaN;
      if (Number.isNaN(t)) return false;
      if (startTs !== null && t < startTs) return false;
      if (endTs !== null && t >= endTs) return false;
    }
    return true;
  }), [wasteItems, radionuclide, status, examType, startTs, endTs]);

  const filteredIncidents = useMemo(() => incidents.filter((i) => {
    if (startTs === null && endTs === null) return true;
    const t = i.date ? new Date(i.date).getTime() : NaN;
    if (Number.isNaN(t)) return false;
    if (startTs !== null && t < startTs) return false;
    if (endTs !== null && t >= endTs) return false;
    return true;
  }), [incidents, startTs, endTs]);

  const stats = useMemo(() => computeStats(filteredWaste, filteredIncidents), [filteredWaste, filteredIncidents]);
  const cc = stats.computedConformity;

  const statusChart = stats.byStatus.map((s) => ({ name: s.label, value: s.count }));
  const rnChart = stats.byRadionuclide.map((r) => ({ name: r.radionuclide, déchets: r.count }));
  const examChart = stats.daily.byExamType.map((e) => ({ name: e.label, value: e.count }));
  const monthlyChart = stats.monthly.map((m) => ({ name: m.month.slice(2), créés: m.created, éliminés: m.eliminated }));

  function handleExportStatsCsv() {
    downloadCsv('statistiques_radwaste.csv', ['Section', 'Élément', 'Valeur'], statsToCsvRows(stats));
    success('Statistiques exportées (CSV / Excel).');
    void writeLog(profile.hospitalId, 'Export des statistiques (CSV).');
  }

  function handleExportDataCsv() {
    const headers = wasteExportHeaders();
    const rows = wasteExportRows(filteredWaste);
    downloadCsv('donnees_dechets_radwaste.csv', headers, rows);
    success(`Données exportées : ${rows.length} déchet(s), ${headers.length} colonnes.`);
    void writeLog(profile.hospitalId, 'Export des données déchets (CSV).');
  }

  function handleExportJson() {
    downloadJson('statistiques_radwaste.json', {
      generatedAt: new Date().toISOString(),
      filters: { start, end, radionuclide, status, examType },
      stats,
      champs: wasteExportFieldLabels(),
      donnees: wasteExportRecords(filteredWaste),
    });
    success(`Statistiques et données exportées (JSON) : ${filteredWaste.length} déchet(s).`);
    void writeLog(profile.hospitalId, 'Export des statistiques et données déchets (JSON).');
  }

  const selectClass = 'px-3 py-2 bg-surface-2 border border-subtle rounded-lg text-primary text-sm';
  const exportBtn = 'inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-subtle text-sm font-bold text-muted hover:text-primary hover:bg-surface-2';

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <SectionHeader
          title="Statistiques & Études"
          description="Analyse complète des données (filtrable) avec export Excel/CSV, JSON et PDF."
          action={
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleExportStatsCsv} className={exportBtn}><FileSpreadsheet className="w-4 h-4" aria-hidden="true" />Stats (Excel/CSV)</button>
              <button type="button" onClick={handleExportDataCsv} className={exportBtn}><Download className="w-4 h-4" aria-hidden="true" />Données (Excel/CSV)</button>
              <button type="button" onClick={handleExportJson} className={exportBtn}><FileJson className="w-4 h-4" aria-hidden="true" />JSON</button>
              <button type="button" onClick={() => window.print()} className={exportBtn}><Printer className="w-4 h-4" aria-hidden="true" />Imprimer / PDF</button>
            </div>
          }
        />
      </div>

      {/* Filtres */}
      <div className="bg-surface border border-subtle rounded-2xl p-4 flex flex-wrap items-end gap-4 print:hidden">
        <div>
          <label className="block text-xs uppercase font-bold tracking-wide text-muted mb-1">Du (date de création)</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={selectClass} />
        </div>
        <div>
          <label className="block text-xs uppercase font-bold tracking-wide text-muted mb-1">Au</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={selectClass} />
        </div>
        <div>
          <label className="block text-xs uppercase font-bold tracking-wide text-muted mb-1">Radionucléide</label>
          <select value={radionuclide} onChange={(e) => setRadionuclide(e.target.value)} className={selectClass}>
            <option value="">Tous</option>
            {Array.from(new Set(wasteItems.map((w) => w.radionuclide))).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase font-bold tracking-wide text-muted mb-1">Statut</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
            <option value="">Tous</option>
            <option value="stockage">En stockage</option>
            <option value="liberable">Libérable</option>
            <option value="elimine">Éliminé</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase font-bold tracking-wide text-muted mb-1">Type d&apos;examen</label>
          <select value={examType} onChange={(e) => setExamType(e.target.value)} className={selectClass}>
            <option value="">Tous</option>
            {settings.examTypes.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        {(start || end || radionuclide || status || examType) && (
          <button type="button" onClick={() => { setStart(''); setEnd(''); setRadionuclide(''); setStatus(''); setExamType(''); }}
            className="px-3 py-2 rounded-lg text-sm font-bold text-muted hover:text-primary border border-subtle">Réinitialiser</button>
        )}
      </div>

      <h2 className="hidden print:block text-xl font-bold text-black">Rapport statistique — RadWaste IMENA ({new Date().toLocaleDateString('fr-FR')})</h2>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard title="Déchets (total)" value={stats.totals.total} icon={<Boxes className="h-5 w-5" />} />
        <KPICard title="Activité init. (MBq)" value={stats.activity.initialTotalMBq.toFixed(0)} icon={<Activity className="h-5 w-5" />} valueClass="text-accent" />
        <KPICard title="Éliminés" value={stats.totals.elimine} icon={<CheckCircle2 className="h-5 w-5" />} />
        <KPICard title="Non conformes" value={stats.totals.nonConforme} icon={<ShieldAlert className="h-5 w-5" />} valueClass="text-amber-500" />
        <KPICard title="Incidents" value={stats.totals.incidents} icon={<AlertTriangle className="h-5 w-5" />} valueClass="text-red-500" />
        <KPICard title="Patients (cumul)" value={stats.daily.totalPatients} icon={<Users2 className="h-5 w-5" />} hint="Somme des patients du jour saisis." />
      </div>

      {/* Conformité CALCULÉE — indicateur de preuve, distinct du statut « libérable » */}
      <div className="bg-surface border border-subtle rounded-2xl p-6">
        <h3 className="font-bold text-primary uppercase text-sm">Conformité calculée (déchets éliminés)</h3>
        <p className="text-xs text-muted mt-1">
          Activité massique sous le niveau de libération ET indice de conformité ≥ 1. Calculée à partir des données
          saisies, jamais déclarée : « indéterminé » signifie qu&apos;une donnée manque, pas que le déchet est conforme.
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 text-sm">
          <Metric label="Éliminés évalués" value={String(cc.evaluated)} />
          <Metric label="Conformes" value={countWithRate(cc.conforme, cc.conformeRate)} valueClass="text-green-600" />
          <Metric label="Non conformes" value={countWithRate(cc.nonConforme, cc.nonConformeRate)} valueClass="text-red-500" />
          <Metric label="Indéterminés (données manquantes)" value={countWithRate(cc.indetermine, cc.indetermineRate)} valueClass="text-amber-500" />
          <Metric label="Sortis trop tôt (indice < 1)" value={String(cc.releasedTooEarly)} valueClass={cc.releasedTooEarly > 0 ? 'text-red-500' : undefined} />
          <Metric label="Indice de conformité médian" value={fmtNum(cc.medianIndex, 2)} />
          <Metric label="Indice de conformité moyen" value={fmtNum(cc.meanIndex, 2)} />
          <Metric label="Durée de stockage moyenne" value={fmtNum(cc.meanStorageHours, 1, ' h')} />
          <Metric label="Durée théorique moyenne (t_lib)" value={fmtNum(cc.meanTLibHours, 1, ' h')} />
        </div>
      </div>

      {/* Complétude des données */}
      <CompletenessTable stats={stats.completeness} />

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Déchets par radionucléide">
          <BarChart data={rnChart}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="name" stroke={axisStroke} fontSize={11} />
            <YAxis allowDecimals={false} stroke={axisStroke} fontSize={11} />
            <RechartsTooltip contentStyle={tooltipStyle} />
            <Bar dataKey="déchets" fill="#FACC15" />
          </BarChart>
        </ChartCard>

        <ChartCard title="Répartition par statut">
          <PieChart>
            <Pie data={statusChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
              {statusChart.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <RechartsTooltip contentStyle={tooltipStyle} />
            <Legend />
          </PieChart>
        </ChartCard>

        <ChartCard title="Évolution mensuelle (12 mois)">
          <BarChart data={monthlyChart}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="name" stroke={axisStroke} fontSize={11} />
            <YAxis allowDecimals={false} stroke={axisStroke} fontSize={11} />
            <RechartsTooltip contentStyle={tooltipStyle} />
            <Legend />
            <Bar dataKey="créés" fill="#3B82F6" />
            <Bar dataKey="éliminés" fill="#22C55E" />
          </BarChart>
        </ChartCard>

        <ChartCard title="Examens du jour par type">
          {examChart.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-faint">Aucune donnée d&apos;examen.</div>
          ) : (
            <PieChart>
              <Pie data={examChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                {examChart.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Legend />
            </PieChart>
          )}
        </ChartCard>
      </div>

      {/* Tableaux d'agrégation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StatTable title="Par radionucléide" headers={['Radionucléide', 'Nb', 'Act. init (MBq)', 'Résiduel (MBq)']}
          rows={stats.byRadionuclide.map((r) => [r.radionuclide, String(r.count), r.initialActivityMBq.toFixed(1), r.residualActivityMBq.toFixed(2)])} />
        <StatTable title="Par service d'origine" headers={['Service', 'Nb']} rows={stats.byService.map((c) => [c.label, String(c.count)])} />
        <StatTable title="Par type de déchet" headers={['Type', 'Nb']} rows={stats.byType.map((c) => [c.label, String(c.count)])} />
        <StatTable title="Éliminations par mode" headers={['Mode', 'Nb']} rows={stats.byEliminationMode.map((c) => [c.label, String(c.count)])} />
        <StatTable title="Examens du jour" headers={['Examen', 'Occurrences']} rows={stats.daily.byExamType.map((c) => [c.label, String(c.count)])} />
        <StatTable title="Incidents par type" headers={['Type', 'Nb']} rows={stats.incidents.byType.map((c) => [c.label, String(c.count)])} />
      </div>

      {/* Indicateurs synthétiques */}
      <div className="bg-surface border border-subtle rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <Metric label="Durée moyenne de stockage" value={stats.meanStorageDays !== null ? `${stats.meanStorageDays.toFixed(1)} j` : '—'} />
        <Metric label="Sorties conformes" value={String(stats.conformity.conforme)} />
        <Metric label="Dérogations (non conformes)" value={String(stats.conformity.derogation)} />
        <Metric label="Élution cumulée (MBq)" value={stats.daily.totalElutionMBq.toFixed(1)} />
        <Metric label="Activité résiduelle en stock (MBq)" value={stats.activity.residualTotalMBq.toFixed(2)} />
        <Metric label="Activité éliminée (MBq, init.)" value={stats.activity.eliminatedInitialMBq.toFixed(1)} />
        <Metric label="Dose moy. incident avant (µSv/h)" value={stats.incidents.meanDoseBefore !== null ? stats.incidents.meanDoseBefore.toFixed(1) : '—'} />
        <Metric label="Dose moy. incident après (µSv/h)" value={stats.incidents.meanDoseAfter !== null ? stats.incidents.meanDoseAfter.toFixed(1) : '—'} />
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div className="bg-surface border border-subtle rounded-2xl p-6">
      <h3 className="font-bold text-primary uppercase text-sm mb-4">{title}</h3>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

function StatTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <div className="bg-surface border border-subtle rounded-2xl overflow-hidden">
      <h3 className="font-bold text-primary uppercase text-sm px-4 py-3 border-b border-subtle">{title}</h3>
      {rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-faint">Aucune donnée.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-subtle text-left">
                {headers.map((h) => <th key={h} className="px-4 py-2 font-bold uppercase text-xs text-muted">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-subtle last:border-0">
                  {r.map((c, j) => <td key={j} className={`px-4 py-2 ${j === 0 ? 'text-primary' : 'text-muted tabular'}`}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, valueClass = 'text-primary' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-xs text-muted tracking-wide">{label}</div>
      <div className={`text-xl font-black italic tabular ${valueClass}`}>{value}</div>
    </div>
  );
}

/** Taux de remplissage des champs critiques : un champ jamais saisi apparaît en rouge à 0 %. */
function CompletenessTable({ stats }: { stats: CompletenessStat[] }) {
  return (
    <div className="bg-surface border border-subtle rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-subtle">
        <h3 className="font-bold text-primary uppercase text-sm">Complétude des données</h3>
        <p className="text-xs text-muted">
          Part des déchets pour lesquels le champ est renseigné. Un champ à 0 % n&apos;a jamais été saisi : les
          indicateurs qui en dépendent restent incalculables.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-subtle text-left">
              {['Champ', 'Périmètre', 'Renseignés', 'Taux'].map((h) => (
                <th key={h} className="px-4 py-2 font-bold uppercase text-xs text-muted">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.map((c) => {
              const rate = c.rate;
              const critical = rate !== null && rate === 0;
              const partial = rate !== null && rate > 0 && rate < 50;
              const tone = critical ? 'text-red-500' : partial ? 'text-amber-500' : 'text-green-600';
              const bar = critical ? 'bg-red-500' : partial ? 'bg-amber-500' : 'bg-green-500';
              return (
                <tr key={`${c.scope}-${c.label}`} className="border-b border-subtle last:border-0">
                  <td className="px-4 py-2 text-primary">{c.label}</td>
                  <td className="px-4 py-2 text-muted">{c.scope === 'elimines' ? 'Éliminés' : 'Tous'}</td>
                  <td className="px-4 py-2 text-muted tabular">{c.filled} / {c.total}</td>
                  <td className="px-4 py-2">
                    {rate === null ? (
                      <span className="text-faint">—</span>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-24 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden print:hidden">
                          <div className={`h-full rounded-full ${bar}`} style={{ width: `${rate}%` }} />
                        </div>
                        <span className={`font-bold tabular ${tone}`}>{rate.toFixed(0)} %</span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
