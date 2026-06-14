'use client';

import React, { useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { WasteItem, User, AppSettings } from '@/types';
import { residualActivityMBq, evaluateExitControl } from '@/lib/physics/decay';
import { EXIT_DOSE_RATE_THRESHOLD_USV_H } from '@/lib/physics/clearanceLevels';
import { updateWasteItem } from '@/lib/repositories/wasteRepository';
import { writeLog } from '@/lib/repositories/logRepository';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { FormInput, FormSelect } from '@/components/ui/Form';
import { IconButton, StatusBadge, EmptyState, SectionHeader } from '@/components/ui/Primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';

interface SortieViewProps {
  wasteItems: WasteItem[];
  users: User[];
  profile: User;
  settings: AppSettings;
}

/** Formate une date ISO en date locale française, ou un tiret si absente/invalide. */
function formatIsoDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR');
}

/** Date-heure locale courante tronquée à la minute (format attendu par un input datetime-local). */
function nowLocal16(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SortieView({ wasteItems, users, profile, settings }: SortieViewProps) {
  const { success, error } = useToast();

  // Item en cours de contrôle (null = modale fermée).
  const [controlled, setControlled] = useState<WasteItem | null>(null);
  const [exitDoseRate, setExitDoseRate] = useState('');
  const [eliminationMode, setEliminationMode] = useState('');
  const [exitController, setExitController] = useState(profile.name);
  const [releaseDate, setReleaseDate] = useState(''); // « Libéré le » — modifiable (ex. saisie d'anciens déchets)
  const [derogationConfirmed, setDerogationConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const rows = useMemo(
    () => wasteItems.filter((w) => w.status === 'liberable' || w.status === 'elimine'),
    [wasteItems],
  );

  const userNames = useMemo(() => users.map((u) => u.name), [users]);

  // Évaluation en direct du contrôle de sortie (recalculée à chaque saisie du débit de dose).
  const parsedDose = exitDoseRate.trim() === '' ? Number.NaN : Number(exitDoseRate);
  const evaluation = useMemo(() => {
    if (!controlled || !Number.isFinite(parsedDose)) return null;
    return evaluateExitControl(controlled, parsedDose);
  }, [controlled, parsedDose]);

  const needsDerogation = evaluation !== null && !evaluation.meetsAllCriteria;

  function openControl(item: WasteItem) {
    setControlled(item);
    setExitDoseRate('');
    setEliminationMode('');
    setExitController(profile.name);
    setReleaseDate(nowLocal16());
    setDerogationConfirmed(false);
  }

  function closeControl() {
    setControlled(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!controlled || isSubmitting) return;

    if (!Number.isFinite(parsedDose) || parsedDose < 0) {
      error('Le débit de dose mesuré doit être un nombre positif ou nul (µSv/h).');
      return;
    }
    if (!eliminationMode) {
      error("Veuillez sélectionner un mode d'élimination.");
      return;
    }
    if (!exitController) {
      error('Veuillez désigner le contrôleur de sortie.');
      return;
    }

    const ev = evaluateExitControl(controlled, parsedDose);
    if (!ev.meetsAllCriteria && !derogationConfirmed) {
      error('Critères non satisfaits : confirmez la dérogation sous responsabilité de la PCR.');
      return;
    }

    // « Libéré le » : par défaut maintenant, mais modifiable (saisie d'anciens déchets du registre).
    const releaseTs = releaseDate ? new Date(releaseDate) : new Date();
    if (Number.isNaN(releaseTs.getTime())) {
      error('Date de sortie (« Libéré le ») invalide.');
      return;
    }
    const releaseIso = releaseTs.toISOString();
    const exitConformity = ev.meetsAllCriteria;
    const identifier = controlled.registryNumber ?? controlled.id;

    setIsSubmitting(true);
    try {
      await updateWasteItem(controlled.id, {
        status: 'elimine',
        exitControlDate: releaseIso,
        exitDoseRate: Number(parsedDose),
        exitConformity,
        exitController,
        exitSignedBy: profile.email, // signature électronique : compte authentifié
        eliminationDate: releaseIso,
        eliminationMode,
        eliminationResponsible: exitController,
      });
      const conformityLabel = exitConformity ? 'conforme' : 'dérogation PCR';
      success(`Contrôle de sortie enregistré pour ${identifier} (${conformityLabel}).`);
      await writeLog(
        profile.hospitalId,
        `Contrôle de sortie du déchet ${identifier} : ${conformityLabel}, mode « ${eliminationMode} », contrôleur ${exitController}, signé par ${profile.email ?? profile.name}.`,
      );
      closeControl();
    } catch {
      error("Échec de l'enregistrement du contrôle de sortie.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const controlledIdentifier = controlled ? (controlled.registryNumber ?? controlled.id) : '';

  const columns = useMemo<Column<WasteItem>[]>(
    () => [
      {
        key: 'identifier',
        header: 'Identifiant',
        searchValue: (w) => `${w.registryNumber ?? w.id} ${w.type}`,
        sortValue: (w) => `${w.registryNumber ?? w.id}`,
        csvValue: (w) => `${w.registryNumber ?? w.id} (${w.type})`,
        render: (w) => {
          const identifier = w.registryNumber ?? w.id;
          return (
            <>
              <div className="font-mono text-primary">{identifier}</div>
              <div className="text-xs text-muted capitalize">{w.type}</div>
            </>
          );
        },
      },
      {
        key: 'residual',
        header: 'Activité résiduelle',
        sortValue: (w) => residualActivityMBq(w) ?? -1,
        csvValue: (w) => {
          const residual = residualActivityMBq(w);
          return residual !== null ? `${residual.toFixed(4)} MBq` : '—';
        },
        render: (w) => {
          const residual = residualActivityMBq(w);
          return (
            <span className="text-primary">
              {residual !== null ? `${residual.toFixed(4)} MBq` : '—'}
            </span>
          );
        },
      },
      {
        key: 'status',
        header: 'Statut',
        sortValue: (w) => w.status,
        csvValue: (w) => w.status,
        render: (w) => <StatusBadge status={w.status} />,
      },
      {
        key: 'control',
        header: 'Contrôle / Action',
        align: 'right',
        csvValue: (w) => {
          if (w.status === 'liberable') return 'À contrôler';
          return [
            `Contrôlé le ${formatIsoDate(w.eliminationDate)}`,
            `Mode : ${w.eliminationMode ?? '—'}`,
            `Conformité : ${w.exitConformity ? 'Oui' : 'Non/Dérogation'}`,
            `Signé : ${w.exitSignedBy ?? w.exitController ?? '—'}`,
          ].join(' | ');
        },
        render: (w) => {
          const identifier = w.registryNumber ?? w.id;
          return w.status === 'liberable' ? (
            <IconButton
              onClick={() => openControl(w)}
              label={`Contrôle de sortie du déchet ${identifier}`}
              variant="info"
            >
              <span className="flex items-center gap-1 text-xs font-bold">
                <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
                Contrôle →
              </span>
            </IconButton>
          ) : (
            <div className="text-xs text-muted space-y-0.5">
              <div>Contrôlé le {formatIsoDate(w.eliminationDate)}</div>
              <div>Mode : {w.eliminationMode ?? '—'}</div>
              <div>Conformité : {w.exitConformity ? 'Oui' : 'Non/Dérogation'}</div>
              <div>Signé : {w.exitSignedBy ?? w.exitController ?? '—'}</div>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Contrôle avant sortie"
        description="Contrôle radiologique de sortie et traçabilité de l'élimination des déchets libérables."
      />

      {rows.length === 0 ? (
        <div className="bg-surface border border-subtle rounded-2xl overflow-hidden">
          <EmptyState message="Aucun déchet libérable ou éliminé à afficher." />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(w) => w.id}
          searchPlaceholder="Rechercher (ID, type)…"
          pageSize={10}
          emptyMessage="Aucun déchet libérable ou éliminé à afficher."
          exportFileName="sorties_eliminations"
        />
      )}

      {controlled && (
        <Modal
          open
          onClose={closeControl}
          title="Contrôle avant Sortie"
          subtitle={controlledIdentifier}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormInput
              label="Débit de dose mesuré au contact (µSv/h)"
              name="exitDoseRate"
              type="number"
              step="0.01"
              min="0"
              value={exitDoseRate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExitDoseRate(e.target.value)}
              placeholder={`Seuil de libération : < ${EXIT_DOSE_RATE_THRESHOLD_USV_H} µSv/h`}
              required
            />
            <p className="text-xs text-faint -mt-2">
              Seuil de libération recommandé : <span className="font-bold text-muted">&lt; {EXIT_DOSE_RATE_THRESHOLD_USV_H} µSv/h</span> (au contact).
            </p>

            <FormSelect
              label="Mode d'élimination"
              name="eliminationMode"
              value={eliminationMode}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEliminationMode(e.target.value)}
              options={settings.eliminationModes}
              required
            />

            <FormSelect
              label="Contrôleur de sortie"
              name="exitController"
              value={exitController}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setExitController(e.target.value)}
              options={userNames}
              required
            />

            <FormInput
              label="Libéré le (date de sortie)"
              name="releaseDate"
              type="datetime-local"
              value={releaseDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReleaseDate(e.target.value)}
              required
            />
            <p className="text-xs text-faint -mt-2">
              Par défaut la date du jour. Modifiable pour enregistrer d&apos;anciens déchets du registre avec leur date réelle de sortie.
            </p>

            {needsDerogation && evaluation && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 space-y-2">
                <p className="text-sm font-bold text-red-500">Critères de sortie non satisfaits :</p>
                <ul className="list-disc list-inside text-xs text-red-500 space-y-1">
                  {evaluation.blockingReasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
                <label className="flex items-start gap-2 text-xs text-primary pt-1">
                  <input
                    type="checkbox"
                    checked={derogationConfirmed}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDerogationConfirmed(e.target.checked)}
                    required
                    className="mt-0.5"
                  />
                  <span>Je confirme la dérogation sous responsabilité de la PCR</span>
                </label>
              </div>
            )}

            {evaluation && evaluation.meetsAllCriteria && (
              <p className="text-xs text-green-600 font-bold">
                Tous les critères de sortie sont satisfaits : sortie conforme.
              </p>
            )}

            <p className="text-xs text-faint">
              Validation signée électroniquement par{' '}
              <span className="text-muted font-medium">{profile.email ?? profile.name}</span> (horodatage serveur).
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeControl}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg text-sm font-bold text-muted hover:text-primary border border-subtle disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-accent text-black hover:opacity-90 disabled:opacity-50"
              >
                {isSubmitting ? 'Enregistrement…' : 'Valider le contrôle'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
