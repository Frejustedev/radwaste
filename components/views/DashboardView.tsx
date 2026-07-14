'use client';

import React, { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { Plus, ClipboardCheck, FileText, Package, Activity, CheckCircle2, AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { WasteItem, Incident } from '@/types';
import { evaluateConformity, residualActivityMBq } from '@/lib/physics/decay';
import { KPICard, StatusBadge } from '@/components/ui/Primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';

interface DashboardViewProps {
  wasteItems: WasteItem[];
  incidents: Incident[];
  onNavigate: (tab: string) => void;
  theme: 'dark' | 'light';
}

// Palette camembert statut : lisible sur les deux thèmes.
const STATUS_COLORS = ['#FACC15', '#22C55E', '#64748B'];

interface ChartPalette {
  grid: string;
  axis: string;
  barFill: string;
  tooltip: {
    backgroundColor: string;
    border: string;
    color: string;
    borderRadius: number;
  };
}

function getChartPalette(theme: 'dark' | 'light'): ChartPalette {
  if (theme === 'light') {
    return {
      grid: '#cbd5e1',
      axis: '#475569',
      barFill: '#CA8A04',
      tooltip: {
        backgroundColor: '#FFFFFF',
        border: '1px solid #cbd5e1',
        color: '#0f172a',
        borderRadius: 8,
      },
    };
  }
  return {
    grid: '#334155',
    axis: '#64748b',
    barFill: '#FACC15',
    tooltip: {
      backgroundColor: '#0D0E12',
      border: '1px solid #334155',
      color: '#F8FAFC',
      borderRadius: 8,
    },
  };
}

export function DashboardView({ wasteItems, incidents, onNavigate, theme }: DashboardViewProps) {
  const palette = useMemo(() => getChartPalette(theme), [theme]);

  const stockageCount = useMemo(
    () => wasteItems.filter((w) => w.status === 'stockage').length,
    [wasteItems],
  );

  const liberableCount = useMemo(
    () => wasteItems.filter((w) => w.status === 'liberable').length,
    [wasteItems],
  );

  const elimineCount = useMemo(
    () => wasteItems.filter((w) => w.status === 'elimine').length,
    [wasteItems],
  );

  const totalResidualMBq = useMemo(() => {
    return wasteItems
      .filter((w) => w.status === 'stockage' || w.status === 'liberable')
      .reduce<number>((sum, w) => {
        const residual = residualActivityMBq(w);
        return residual === null ? sum : sum + residual;
      }, 0);
  }, [wasteItems]);

  const validIncidentsCount = useMemo(() => {
    const wasteIds = new Set(wasteItems.map((w) => w.id));
    return incidents.filter((i) => !i.wasteId || wasteIds.has(i.wasteId)).length;
  }, [incidents, wasteItems]);

  // Déchets non conformes : sortis sous dérogation (contrôle de sortie non conforme).
  const nonConformesCount = useMemo(
    () => wasteItems.filter((w) => w.exitConformity === false).length,
    [wasteItems],
  );

  // Conformité CALCULÉE (activité massique ≤ seuil ET indice de conformité ≥ 1) sur les déchets éliminés.
  const conformite = useMemo(() => {
    const tally = { conformes: 0, nonConformes: 0, indetermines: 0 };
    for (const w of wasteItems) {
      if (w.status !== 'elimine') continue;
      const { conforme } = evaluateConformity(w);
      if (conforme === null) tally.indetermines += 1;
      else if (conforme) tally.conformes += 1;
      else tally.nonConformes += 1;
    }
    return tally;
  }, [wasteItems]);

  const statusChartData = useMemo(
    () => [
      { name: 'En stockage', value: stockageCount },
      { name: 'Libérables', value: liberableCount },
      { name: 'Éliminés', value: elimineCount },
    ],
    [stockageCount, liberableCount, elimineCount],
  );

  const radionuclideChartData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of wasteItems) {
      if (w.status === 'elimine') continue;
      counts.set(w.radionuclide, (counts.get(w.radionuclide) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  }, [wasteItems]);

  const releasableItems = useMemo(
    () => wasteItems.filter((w) => w.status === 'liberable'),
    [wasteItems],
  );

  const formatDate = (iso?: string): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
  };

  const releasableColumns = useMemo<Column<WasteItem>[]>(
    () => [
      {
        key: 'id',
        header: 'ID',
        render: (row) => (
          <span className="font-mono text-accent">{row.registryNumber ?? row.id}</span>
        ),
        searchValue: (row) => row.registryNumber ?? row.id,
        sortValue: (row) => row.registryNumber ?? row.id,
      },
      {
        key: 'type',
        header: 'Type',
        render: (row) => <span className="text-primary">{row.type}</span>,
        searchValue: (row) => row.type,
        sortValue: (row) => row.type,
      },
      {
        key: 'radionuclide',
        header: 'Radionucléide',
        render: (row) => <span className="text-primary">{row.radionuclide}</span>,
        searchValue: (row) => row.radionuclide,
      },
      {
        key: 'storageEntryDate',
        header: "Date d'entrée",
        render: (row) => <span className="text-muted">{formatDate(row.storageEntryDate)}</span>,
        sortValue: (row) => {
          const t = row.storageEntryDate ? new Date(row.storageEntryDate).getTime() : NaN;
          return Number.isNaN(t) ? 0 : t;
        },
        csvValue: (row) => formatDate(row.storageEntryDate),
      },
      {
        key: 'status',
        header: 'Statut',
        render: () => <StatusBadge status="liberable" />,
        csvValue: () => 'liberable',
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      {/* Actions rapides */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onNavigate('identification')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-black font-bold text-sm transition-transform hover:scale-[1.02]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nouveau Déchet
        </button>
        <button
          type="button"
          onClick={() => onNavigate('sortie')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-surface border border-subtle text-primary font-bold text-sm transition-colors hover:bg-surface-2"
        >
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
          Libérer des déchets
        </button>
        <button
          type="button"
          onClick={() => onNavigate('reports')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-surface border border-subtle text-primary font-bold text-sm transition-colors hover:bg-surface-2"
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          Registre PDF
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard
          title="En Stockage"
          value={stockageCount}
          icon={<Package className="h-5 w-5" />}
          hint="Déchets actuellement en décroissance dans le local."
        />
        <KPICard
          title="Activité totale (MBq)"
          value={totalResidualMBq.toFixed(2)}
          icon={<Activity className="h-5 w-5" />}
          valueClass="text-accent"
          hint="Somme des activités résiduelles des déchets en stockage et libérables."
        />
        <KPICard
          title="Libérables"
          value={liberableCount}
          icon={<CheckCircle2 className="h-5 w-5" />}
          hint="Déchets ayant atteint les critères de libération, en attente de contrôle de sortie."
        />
        <KPICard
          title="Non conformes"
          value={nonConformesCount}
          icon={<ShieldAlert className="h-5 w-5" />}
          valueClass="text-amber-500"
          hint="Déchets sortis sous dérogation : contrôle de sortie validé alors qu'un critère réglementaire n'était pas satisfait (sous responsabilité de la PCR)."
        />
        <KPICard
          title="Incidents"
          value={validIncidentsCount}
          icon={<AlertTriangle className="h-5 w-5" />}
          valueClass="text-red-500"
          hint="Incidents déclarés (déversement, contamination, perte de déchet)."
        />
        <KPICard
          title="Conformité calculée"
          value={
            <div className="text-sm font-bold not-italic tracking-normal space-y-0.5">
              <div className="text-green-600">{conformite.conformes} conforme(s)</div>
              <div className="text-red-500">{conformite.nonConformes} non conforme(s)</div>
              <div className="text-muted">{conformite.indetermines} indéterminé(s)</div>
            </div>
          }
          icon={<ShieldCheck className="h-5 w-5" />}
          hint="Déchets éliminés : conformité calculée (activité massique ≤ seuil ET indice de conformité ≥ 1). Indéterminé = donnée manquante."
        />
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-subtle rounded-2xl p-6">
          <h3 className="font-bold text-primary uppercase text-sm mb-4">Répartition par Statut</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label
                >
                  {statusChartData.map((entry, index) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={palette.tooltip} itemStyle={{ color: palette.tooltip.color }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-surface border border-subtle rounded-2xl p-6">
          <h3 className="font-bold text-primary uppercase text-sm mb-4">Volume par Radionucléide</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={radionuclideChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
                <XAxis dataKey="name" stroke={palette.axis} />
                <YAxis allowDecimals={false} stroke={palette.axis} />
                <RechartsTooltip
                  contentStyle={palette.tooltip}
                  itemStyle={{ color: palette.tooltip.color }}
                  cursor={{ fill: theme === 'light' ? 'rgba(203,213,225,0.3)' : 'rgba(51,65,85,0.3)' }}
                />
                <Bar dataKey="count" fill={palette.barFill} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Table des déchets candidats à la libération */}
      <div>
        <h3 className="font-bold text-primary uppercase text-sm mb-3">Déchets candidats à la libération</h3>
        <DataTable
          columns={releasableColumns}
          rows={releasableItems}
          getRowKey={(r) => r.id}
          searchPlaceholder="Rechercher un déchet libérable…"
          pageSize={5}
          emptyMessage="Aucun déchet candidat à la libération pour le moment."
          exportFileName="dechets_liberables"
        />
      </div>
    </div>
  );
}
