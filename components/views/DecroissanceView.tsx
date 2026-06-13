'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, BellRing } from 'lucide-react';
import type { WasteItem, User } from '@/types';
import { evaluateDecay } from '@/lib/physics/decay';
import { releaseWasteItems } from '@/lib/repositories/wasteRepository';
import { writeLog } from '@/lib/repositories/logRepository';
import { useToast } from '@/components/ui/Toast';
import { StatusBadge, EmptyState, SectionHeader } from '@/components/ui/Primitives';

interface DecroissanceViewProps {
  wasteItems: WasteItem[];
  profile: User;
}

export function DecroissanceView({ wasteItems, profile }: DecroissanceViewProps): React.ReactElement {
  const { success, error } = useToast();
  const [isWorking, setIsWorking] = useState<boolean>(false);
  // « Tick » de rafraîchissement : recalcule les activités résiduelles toutes les 60 s.
  const [tick, setTick] = useState<number>(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // `now` est figé à chaque tick pour que toutes les cellules d'un même rendu partagent l'instant.
  const now = useMemo<Date>(() => {
    void tick; // dépendance volontaire : force le recalcul à chaque tick de rafraîchissement
    return new Date();
  }, [tick]);

  // Déchets affichés dans la table : tout sauf les éliminés.
  const visibleItems = useMemo<WasteItem[]>(
    () => wasteItems.filter((w) => w.status !== 'elimine'),
    [wasteItems],
  );

  // Alerte automatique : déchets encore « en stockage » ayant déjà atteint le seuil réglementaire.
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
      const evaluationNow = new Date();
      const releasableIds = wasteItems
        .filter((w) => w.status === 'stockage')
        .filter((w) => evaluateDecay(w, evaluationNow).meetsStorageReleaseCriteria)
        .map((w) => w.id);

      if (releasableIds.length === 0) {
        success('Aucun déchet ne remplit les critères de libération.');
        return;
      }

      await releaseWasteItems(releasableIds);
      success(`${releasableIds.length} déchet(s) passé(s) au statut libérable.`);
      await writeLog(
        profile.hospitalId,
        `${releasableIds.length} déchet(s) passé(s) au statut libérable après vérification des seuils par ${profile.name}.`,
      );
    } catch {
      error('Échec de la vérification des seuils. Veuillez réessayer.');
    } finally {
      setIsWorking(false);
    }
  };

  const formatNumber = (value: number | null, fractionDigits: number): string =>
    value === null ? '—' : value.toFixed(fractionDigits);

  const formatExponential = (value: number | null): string =>
    value === null ? '—' : value.toExponential(2);

  const formatDate = (value: Date | null): string =>
    value === null ? '—' : value.toLocaleDateString('fr-FR');

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Décroissance radioactive"
        description="Suivi en temps réel des activités résiduelles et des critères de libération."
        action={
          <button
            type="button"
            onClick={handleCheckThresholds}
            disabled={isWorking}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-sm font-bold text-black disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            <Activity className="w-4 h-4" aria-hidden="true" />
            {isWorking ? 'Vérification…' : 'Vérifier les Seuils'}
          </button>
        }
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

      <div className="bg-surface border border-subtle rounded-2xl overflow-hidden">
        {visibleItems.length === 0 ? (
          <EmptyState message="Aucun déchet en suivi de décroissance." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-2 text-muted text-xs uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-4 py-3 font-bold">Identifiant</th>
                  <th scope="col" className="px-4 py-3 font-bold">Isotope</th>
                  <th scope="col" className="px-4 py-3 font-bold">Mesure initiale</th>
                  <th scope="col" className="px-4 py-3 font-bold">Activité Résiduelle</th>
                  <th scope="col" className="px-4 py-3 font-bold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((w) => {
                  const decay = evaluateDecay(w, now);
                  const firstBlockingReason =
                    w.status === 'stockage' && decay.blockingReasons.length > 0
                      ? decay.blockingReasons[0]
                      : null;
                  const ready = readyIds.has(w.id);
                  return (
                    <tr key={w.id} className={`border-t border-subtle align-top ${ready ? 'bg-yellow-400/5' : ''}`}>
                      <td className="px-4 py-4 font-mono text-xs text-primary">
                        {w.registryNumber ?? w.id}
                      </td>
                      <td className="px-4 py-4 text-primary">
                        <div className="font-bold">{w.radionuclide}</div>
                        <div className="text-xs text-muted">
                          T½ : {w.halfLife} h
                        </div>
                      </td>
                      <td className="px-4 py-4 text-primary">
                        <div className="font-bold">{w.initialActivity} MBq</div>
                        <div className="text-xs text-muted">
                          {w.measureDate
                            ? new Date(w.measureDate).toLocaleString('fr-FR')
                            : '—'}
                        </div>
                      </td>
                      <td className="px-4 py-4 bg-surface-2">
                        <div className="text-lg font-black italic tracking-tight text-accent">
                          {formatNumber(decay.residualMBq, 4)} MBq
                        </div>
                        <div className="mt-1 space-y-0.5 text-xs text-muted">
                          <div>Décroissance : {formatNumber(decay.decayPct, 1)}%</div>
                          <div>
                            Activité massique : {formatExponential(decay.massicBqPerG)} Bq/g
                            {' '}(seuil {decay.clearanceLevelBqPerG ?? '—'} Bq/g)
                          </div>
                          <div>Périodes : {formatNumber(decay.halfLives, 1)}</div>
                          <div>Date sortie estimée : {formatDate(decay.releaseDate)}</div>
                        </div>
                        {firstBlockingReason && (
                          <div className="mt-2 text-xs text-faint">{firstBlockingReason}</div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={w.status} />
                        {ready && (
                          <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-amber-500">Seuil atteint</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
