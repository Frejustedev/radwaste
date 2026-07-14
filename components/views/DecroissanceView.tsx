'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, BellRing } from 'lucide-react';
import type { WasteItem, User } from '@/types';
import { evaluateConformity, evaluateDecay, netMassG, residualActivityMBq, type ConformityEvaluation } from '@/lib/physics/decay';
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
const fmtMass = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));
/** Durée exprimée en heures puis en jours, ex. « 96,0 h (4,0 j) ». */
const fmtDuration = (h: number | null): string => (h === null ? '—' : `${h.toFixed(1)} h (${(h / 24).toFixed(1)} j)`);

/** Libellé de la masse retenue pour l'activité massique : masse nette, tare explicitée si elle existe. */
function massLabel(item: WasteItem): string {
  const net = netMassG(item);
  if (net === null) return '—';
  const { mass, containerTare } = item;
  if (typeof mass === 'number' && typeof containerTare === 'number' && containerTare > 0) {
    return `${fmtMass(net)} g nets (${fmtMass(mass)} g bruts − ${fmtMass(containerTare)} g de tare)`;
  }
  return `${fmtMass(net)} g nets (pas de tare renseignée)`;
}

const VERDICT: Record<'oui' | 'non' | 'inconnu', { label: string; className: string }> = {
  oui: { label: 'CONFORME', className: 'bg-green-500/20 text-green-600' },
  non: { label: 'NON CONFORME', className: 'bg-red-500/20 text-red-500' },
  inconnu: { label: 'INDÉTERMINÉ', className: 'bg-slate-500/20 text-slate-500' },
};

const verdictKey = (c: ConformityEvaluation): 'oui' | 'non' | 'inconnu' =>
  c.conforme === null ? 'inconnu' : c.conforme ? 'oui' : 'non';

/**
 * Un déchet est « sorti » dès qu'une date d'élimination OU de contrôle de sortie est renseignée
 * (miroir de la logique du cœur). Tant qu'il n'est pas sorti, la conformité — preuve documentaire
 * jugée à la sortie — reste indéterminée par construction : on ne l'affiche pas comme un défaut.
 */
const hasExited = (w: WasteItem): boolean => Boolean(w.eliminationDate || w.exitControlDate);

/**
 * Rang de RISQUE pour le tri de la colonne conformité (ordre croissant = plus risqué en premier) :
 * non conforme (0) → indéterminé mais déjà sorti (1) → en stockage / en attente (2) → conforme (3).
 */
function conformityRisk(w: WasteItem, c: ConformityEvaluation): number {
  if (!hasExited(w)) return 2;
  if (c.conforme === false) return 0;
  if (c.conforme === null) return 1;
  return 3;
}

export function DecroissanceView({ wasteItems, profile }: DecroissanceViewProps): React.ReactElement {
  const { success, error } = useToast();
  const [isWorking, setIsWorking] = useState(false);
  const [releasingId, setReleasingId] = useState<string | null>(null);
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

  // Conformité évaluée UNE SEULE fois par ligne (et par tick de 60 s), puis réutilisée par
  // toutes les callbacks de colonne (render / sortValue / csvValue) via `evalOf`.
  const conformityByRow = useMemo<Map<string, ConformityEvaluation>>(() => {
    const m = new Map<string, ConformityEvaluation>();
    for (const w of rows) m.set(w.id, evaluateConformity(w, now));
    return m;
  }, [rows, now]);
  const evalOf = (w: WasteItem): ConformityEvaluation => conformityByRow.get(w.id) ?? evaluateConformity(w, now);

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

  // Libère un déchet individuellement. Si les critères ne sont pas remplis, demande une confirmation
  // explicite (libération forcée, déconseillée) et la trace dans le journal d'audit.
  async function handleReleaseOne(item: WasteItem): Promise<void> {
    if (releasingId) return;
    const decay = evaluateDecay(item, new Date());
    const id = item.registryNumber ?? item.id;
    if (!decay.meetsStorageReleaseCriteria) {
      const reasons = decay.blockingReasons.length > 0 ? '\n• ' + decay.blockingReasons.join('\n• ') : '';
      const ok = window.confirm(
        `⚠️ LIBÉRATION DÉCONSEILLÉE\n\nLe déchet ${id} ne remplit PAS les critères réglementaires de libération :${reasons}\n\n`
        + `Forcer la libération engage la responsabilité de l'opérateur et de la PCR, et sera tracé dans le journal d'audit.\n\nConfirmer la libération forcée ?`,
      );
      if (!ok) return;
    }
    setReleasingId(item.id);
    try {
      await releaseWasteItems([item.id]);
      if (decay.meetsStorageReleaseCriteria) {
        success(`Déchet ${id} passé au statut « libérable ».`);
        await writeLog(profile.hospitalId, `Libération du déchet ${id} (critères remplis) par ${profile.name}.`);
      } else {
        success(`Déchet ${id} libéré — forçage déconseillé (tracé).`);
        await writeLog(profile.hospitalId, `LIBÉRATION FORCÉE (déconseillée) du déchet ${id} par ${profile.name} — critères non remplis : ${decay.blockingReasons.join(' ; ') || 'n/a'}.`);
      }
    } catch {
      error('Échec de la libération. Veuillez réessayer.');
    } finally {
      setReleasingId(null);
    }
  }

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
              <div>Masse retenue : {massLabel(w)}</div>
              <div>Périodes : {fmtNum(decay.halfLives, 1)}</div>
              <div>Date sortie estimée : {fmtDate(decay.releaseDate)}</div>
            </div>
            {reason && <div className="mt-2 text-xs text-faint">{reason}</div>}
          </div>
        );
      },
    },
    {
      key: 'conformite',
      header: 'Conformité calculée',
      // Tri par RISQUE (non conforme d'abord), pas par ordre alphabétique du libellé.
      sortValue: (w) => conformityRisk(w, evalOf(w)),
      csvValue: (w) => {
        if (!hasExited(w)) return 'En stockage (conformité évaluée à la sortie)';
        const c = evalOf(w);
        const index = c.conformityIndex === null ? '' : ` (indice ${c.conformityIndex.toFixed(2)})`;
        return `${VERDICT[verdictKey(c)].label}${index}`;
      },
      render: (w) => {
        const c = evalOf(w);
        const noWaitRequired = c.tLibHours !== null && c.tLibHours <= 0;
        // Sous-lignes informatives (t_lib, durée réelle, indice) conservées dans les deux cas.
        const details = (
          <div className="mt-1 space-y-0.5 text-xs text-muted">
            <div>
              Durée théorique (t_lib) :{' '}
              {noWaitRequired ? '0 h — aucune attente requise' : fmtDuration(c.tLibHours)}
            </div>
            <div>Durée de stockage réelle : {fmtDuration(c.storageHours)}</div>
            <div>
              Indice de conformité :{' '}
              {c.conformityIndex === null
                ? (noWaitRequired ? 'sans objet (aucune attente requise)' : '—')
                : `${c.conformityIndex.toFixed(2)} — ${c.conformityIndex >= 1 ? 'gardé assez longtemps' : 'sorti avant la fin de la décroissance théorique'}`}
            </div>
          </div>
        );

        // Déchet encore en stock : la conformité est une preuve documentaire jugée À LA SORTIE.
        // Pas de verdict CONFORME/NON CONFORME/INDÉTERMINÉ, pas d'alerte « Date de sortie manquante ».
        if (!hasExited(w)) {
          // On surface tout de même d'éventuelles données manquantes RÉELLES (hors date de sortie, attendue).
          const realMissing = c.missing.filter((m) => m !== 'Date de sortie');
          return (
            <div>
              <span className="inline-block px-3 py-1 text-[11px] font-bold rounded-full bg-slate-500/15 text-muted">
                En stockage — conformité évaluée à la sortie
              </span>
              {details}
              {realMissing.length > 0 && (
                <div className="mt-2 text-xs text-faint">Données manquantes : {realMissing.join(' ; ')}.</div>
              )}
            </div>
          );
        }

        // Déchet réellement sorti : verdict documentaire figé à la date de sortie.
        const verdict = VERDICT[verdictKey(c)];
        return (
          <div>
            <span className={`px-3 py-1 text-[11px] font-black rounded-full ${verdict.className}`}>{verdict.label}</span>
            {details}
            {c.missing.length > 0 && (
              <div className="mt-2 text-xs text-faint">Données manquantes : {c.missing.join(' ; ')}.</div>
            )}
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
    {
      key: 'action',
      header: 'Action',
      align: 'right',
      render: (w) => {
        if (w.status !== 'stockage') {
          return <span className="text-xs text-faint">→ Sortie & Élimination</span>;
        }
        const meets = evaluateDecay(w, now).meetsStorageReleaseCriteria;
        const busy = releasingId === w.id;
        return meets ? (
          <button
            type="button"
            onClick={() => void handleReleaseOne(w)}
            disabled={busy}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-accent text-black hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Libération…' : 'Libérer'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleReleaseOne(w)}
            disabled={busy}
            title="Le déchet ne remplit pas les critères : libération déconseillée."
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-amber-500/60 text-amber-500 hover:bg-amber-500/10 disabled:opacity-50"
          >
            {busy ? 'Libération…' : 'Forcer (déconseillé)'}
          </button>
        );
      },
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
            <span className="font-bold">{readyIds.size} déchet(s)</span> remplissent un critère de libération
            (activité massique sous le seuil <span className="font-bold">ou</span> au moins 10 périodes écoulées).
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
