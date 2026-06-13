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
import { Plus, ClipboardCheck, FileText, Package, Activity, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { WasteItem, Incident } from '@/types';
import { residualActivityMBq } from '@/lib/physics/decay';
import { KPICard, StatusBadge, EmptyState } from '@/components/ui/Primitives';

interface DashboardViewProps {
  wasteItems: WasteItem[];
  incidents: Incident[];
  onNavigate: (tab: string) => void;
}

const STATUS_COLORS = ['#FACC15', '#22C55E', '#64748B'];
const AXIS_STROKE = '#64748b';

export function DashboardView({ wasteItems, incidents, onNavigate }: DashboardViewProps) {
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

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
  };

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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          title="En Stockage"
          value={stockageCount}
          icon={<Package className="h-5 w-5" />}
        />
        <KPICard
          title="Activité totale (MBq)"
          value={totalResidualMBq.toFixed(2)}
          icon={<Activity className="h-5 w-5" />}
          valueClass="text-accent"
        />
        <KPICard
          title="Libérables"
          value={liberableCount}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <KPICard
          title="Non conformes"
          value={nonConformesCount}
          icon={<ShieldAlert className="h-5 w-5" />}
          valueClass="text-amber-500"
        />
        <KPICard
          title="Incidents"
          value={validIncidentsCount}
          icon={<AlertTriangle className="h-5 w-5" />}
          valueClass="text-red-500"
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
                <RechartsTooltip />
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
                <CartesianGrid strokeDasharray="3 3" stroke={AXIS_STROKE} />
                <XAxis dataKey="name" stroke={AXIS_STROKE} />
                <YAxis allowDecimals={false} stroke={AXIS_STROKE} />
                <RechartsTooltip />
                <Bar dataKey="count" fill="#FACC15" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Table des déchets candidats à la libération */}
      <div>
        <h3 className="font-bold text-primary uppercase text-sm mb-3">Déchets candidats à la libération</h3>
        <div className="bg-surface border border-subtle rounded-2xl overflow-hidden">
          {releasableItems.length === 0 ? (
            <EmptyState message="Aucun déchet candidat à la libération pour le moment." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-subtle text-left">
                    <th className="px-4 py-3 font-bold text-muted uppercase text-xs">ID</th>
                    <th className="px-4 py-3 font-bold text-muted uppercase text-xs">Type</th>
                    <th className="px-4 py-3 font-bold text-muted uppercase text-xs">Radionucléide</th>
                    <th className="px-4 py-3 font-bold text-muted uppercase text-xs">Date d&apos;entrée</th>
                    <th className="px-4 py-3 font-bold text-muted uppercase text-xs">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {releasableItems.map((item) => (
                    <tr key={item.id} className="border-b border-subtle last:border-0">
                      <td className="px-4 py-3 font-mono text-accent">{item.registryNumber ?? item.id}</td>
                      <td className="px-4 py-3 text-primary">{item.type}</td>
                      <td className="px-4 py-3 text-primary">{item.radionuclide}</td>
                      <td className="px-4 py-3 text-muted">{formatDate(item.storageEntryDate)}</td>
                      <td className="px-4 py-3"><StatusBadge status="liberable" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
