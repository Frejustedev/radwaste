'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, BellRing } from 'lucide-react';
import type { WasteItem, User } from '@/types';
import { evaluateDecay, residualActivityMBq } from '@/lib/physics/decay';
import { releaseWasteItems } from '@/lib/repositories/wasteRepository';
import { writeLog } from '@/lib/repositories/logRepository';
import { useToast } from '@/components/ui/Toast';
import { StatusBadge, SectionHeader } from '@/components/ui/Primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';

interface DecroissanceViewProps {
  wasteItems: WasteItem[];
  profile: User;
}

const fmtNum = (v: number | null, d: number): string => (v === null ? '—' : v.toFixed(d));
const fmtExp = (v: number | null): string => (v === null ? '—' : v.toExponential(2));
const fmtDate = (v: Date | null): string => (v === null ? '—' : v.toLocaleDateString('fr-FR'));

export function DecroissanceView({ wasteItems, profile }: DecroissanceViewProps): React.ReactElement {
  const { success, error } = useToast();
  const [isWorking, setIsWorking] = useState(false);
  // « Tick » de rafraîchissement : recalcule les activités résiduelles toutes les 60 s.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((p) => p + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const now = useMemo<Date>(() => {
    void tick; // dépendance volontaire : force le recalcul à chaque tick
    return new Date();
  }, [tick]);

  const rows = useMemo(() => wasteItems.filter((w) => w.status !== 'elimine'), [wasteItems]);

  // Alerte automatique : déchets « en stockage » ayant déjà atteint le seuil réglementaire.
  const readyIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>();
    for (const w of wasteItems) {
      if (w.status === 'stockage' && evaluateDecay(w, now).meetsStorageReleaseCriteria) ids.add(w.id);
    }
    return ids;
  }, [wasteItems, now]);

  const handleCheckThresholds = async (): Promise<void> => {
    if (isWorking) return;
    setIsWorking(true);
    try {
      const evalNow = new Date();
      const releasableIds = wasteItems
        .filter((w) => w.status === 'stockage' && evaluateDecay(w, evalNow).meetsStorageReleaseCriteria)
        .map((w) => w.id);
      if (releasableIds.length === 0) {
        const alreadyLiberable = wasteItems.filter((w) => w.status === 'liberable').length;
        if (alreadyLiberable > 0) {
          success(`Aucun NOUVEAU déchet à libérer. ${alreadyLiberable} déchet(s) déjà « libérable(s) » — à traiter dans « Sortie & Élimination ».`);
        } else {
          success('Aucun déchet en stockage ne remplit encore les critères de libération.');
        }
        return;
      }
      await releaseWasteItems(releasableIds);
      success(`${releasableIds.length} déchet(s) passé(s) au statut libérable.`);
      await writeLog(profile.hospitalId, `${releasableIds.length} déchet(s) passé(s) au statut libérable après vérification des seuils par ${profile.name}.`);
    } catch {
      error('Échec de la vérification des seuils. Veuillez réessayer.');
    } finally {
      setIsWorking(false);
    }
  };

  // Colonnes recréées à chaque rendu pour refléter `now` (tick) et `readyIds`.
  const columns: Column<WasteItem>[] = [
    {
      key: 'id',
      header: 'Identifiant',
      searchValue: (w) => w.registryNumber ?? w.id,
      sortValue: (w) => w.registryNumber ?? w.id,
      csvValue: (w) => w.registryNumber ?? w.id,
      render: (w) => <span className="font-mono text-xs text-accent">{w.registryNumber ?? w.id}</span>,
    },
    {
      key: 'isotope',
      header: 'Isotope',
      searchValue: (w) => w.radionuclide,
      sortValue: (w) => w.radionuclide,
      csvValue: (w) => w.radionuclide,
      render: (w) => (
        <div>
          <div className="font-bold text-primary">{w.radionuclide}</div>
          <div className="text-xs text-muted tabular">T½ : {w.halfLife} h</div>
        </div>
      ),
    },
    {
      key: 'mesure',
      header: 'Mesure initiale',
      sortValue: (w) => w.initialActivity ?? -1,
      csvValue: (w) => w.initialActivity ?? '',
      render: (w) => (
        <div>
          <div className="font-bold text-primary tabular">{w.initialActivity != null ? `${w.initialActivity} MBq` : '—'}</div>
          <div className="text-xs text-muted">{w.measureDate ? new Date(w.measureDate).toLocaleString('fr-FR') : '—'}</div>
        </div>
      ),
    },
    {
      key: 'residual',
      header: 'Activité résiduelle',
      sortValue: (w) => residualActivityMBq(w, now) ?? -1,
      csvValue: (w) => fmtNum(residualActivityMBq(w, now), 4),
      render: (w) => {
        const decay = evaluateDecay(w, now);
        const reason = w.status === 'stockage' && decay.blockingReasons.length > 0 ? decay.blockingReasons[0] : null;
        return (
          <div>
            <div className="text-base font-black italic tracking-tight text-accent tabular">{fmtNum(decay.residualMBq, 4)} MBq</div>
            <div className="mt-1 space-y-0.5 text-xs text-muted">
              <div>Décroissance : {fmtNum(decay.decayPct, 1)}%</div>
              <div>Activité massique : {fmtExp(decay.massicBqPerG)} Bq/g (seuil {decay.clearanceLevelBqPerG ?? '—'} Bq/g)</div>
              <div>Périodes : {fmtNum(decay.halfLives, 1)}</div>
              <div>Date sortie estimée : {fmtDate(decay.releaseDate)}</div>
            </div>
            {reason && <div className="mt-2 text-xs text-faint">{reason}</div>}
          </div>
        );
      },
    },
    {
      key: 'statut',
      header: 'Statut',
      sortValue: (w) => w.status,
      csvValue: (w) => w.status,
      render: (w) => (
        <div>
          <StatusBadge status={w.status} />
          {readyIds.has(w.id) && <div className="mt-1 text-xs font-bold uppercase tracking-wide text-amber-500">Seuil atteint</div>}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Décroissance radioactive"
        description="Suivi en temps réel des activités résiduelles et des critères de libération."
      />

      {readyIds.size > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-yellow-400/40 bg-yellow-400/10 p-4">
          <BellRing className="w-5 h-5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-primary">
            <span className="font-bold">{readyIds.size} déchet(s)</span> ont atteint le seuil réglementaire de libération
            (activité massique sous le seuil et au moins 10 périodes écoulées).
            Cliquez sur <span className="font-bold">« Vérifier les Seuils »</span> pour les marquer comme libérables.
          </p>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(w) => w.id}
        searchPlaceholder="Rechercher (ID, isotope)…"
        pageSize={10}
        emptyMessage="Aucun déchet en suivi de décroissance."
        exportFileName="suivi_decroissance"
        toolbar={
          <button
            type="button"
            onClick={handleCheckThresholds}
            disabled={isWorking}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-sm font-bold text-black disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Activity className="w-4 h-4" aria-hidden="true" />
            {isWorking ? 'Vérification…' : 'Vérifier les Seuils'}
          </button>
        }
      />
    </div>
  );
}
