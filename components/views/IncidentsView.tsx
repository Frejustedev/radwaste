'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Edit2, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { Incident, WasteItem, User, AppSettings } from '@/types';
import { parsePositiveNumber } from '@/lib/validation/schemas';
import { createIncident, updateIncident, deleteIncident } from '@/lib/repositories/incidentRepository';
import { writeLog } from '@/lib/repositories/logRepository';
import { useToast } from '@/components/ui/Toast';
import { FormSelect, FormInput, FormTextArea } from '@/components/ui/Form';
import { IconButton, SectionHeader } from '@/components/ui/Primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';

interface IncidentsViewProps {
  incidents: Incident[];
  wasteItems: WasteItem[];
  users: User[];
  profile: User;
  settings: AppSettings;
}

interface IncidentFormState {
  type: string;
  personnelFunction: string;
  wasteLabel: string;
  doseRateBefore: string;
  doseRateAfter: string;
  correctiveActions: string;
}

const EMPTY_FORM: IncidentFormState = {
  type: '',
  personnelFunction: '',
  wasteLabel: '',
  doseRateBefore: '',
  doseRateAfter: '',
  correctiveActions: '',
};

function wasteLabelOf(item: WasteItem): string {
  return item.registryNumber ?? item.id;
}

/** Affichage sûr d'une valeur potentiellement non renseignée. */
function displayOrDash(value: string | number | undefined): string {
  if (value === undefined || value === '') return '—';
  return String(value);
}

export function IncidentsView({ incidents, wasteItems, users, profile, settings }: IncidentsViewProps) {
  const { success, error } = useToast();

  const [isAdding, setIsAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<IncidentFormState>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Correspondance label affiché -> id réel du déchet, et inversement pour l'affichage.
  const userNames = useMemo<string[]>(() => users.map((u) => u.name), [users]);
  const wasteLabels = useMemo<string[]>(() => wasteItems.map(wasteLabelOf), [wasteItems]);
  const labelToWasteId = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    wasteItems.forEach((item) => map.set(wasteLabelOf(item), item.id));
    return map;
  }, [wasteItems]);
  const wasteIdToLabel = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    wasteItems.forEach((item) => map.set(item.id, wasteLabelOf(item)));
    return map;
  }, [wasteItems]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setIsAdding(false);
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setIsAdding(true);
  };

  const openEdit = (incident: Incident) => {
    setForm({
      type: incident.type,
      personnelFunction: incident.personnelFunction ?? '',
      wasteLabel: incident.wasteId ? (wasteIdToLabel.get(incident.wasteId) ?? '') : '',
      doseRateBefore: incident.doseRateBefore !== undefined ? String(incident.doseRateBefore) : '',
      doseRateAfter: incident.doseRateAfter !== undefined ? String(incident.doseRateAfter) : '',
      correctiveActions: incident.correctiveActions ?? '',
    });
    setEditId(incident.id);
    setIsAdding(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleTextAreaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Seul le type d'incident est obligatoire désormais.
    if (!form.type) {
      error("Veuillez sélectionner le type d'incident.");
      return;
    }

    // Dose initiale : vide -> non renseignée (undefined) ; renseignée mais invalide -> erreur.
    let doseRateBefore: number | undefined;
    if (form.doseRateBefore.trim() === '') {
      doseRateBefore = undefined;
    } else {
      const parsed = parsePositiveNumber(form.doseRateBefore, { allowZero: true });
      if (parsed === null) {
        error('La dose initiale doit être un nombre positif ou nul (µSv/h).');
        return;
      }
      doseRateBefore = parsed;
    }

    // Dose finale : même logique.
    let doseRateAfter: number | undefined;
    if (form.doseRateAfter.trim() === '') {
      doseRateAfter = undefined;
    } else {
      const parsed = parsePositiveNumber(form.doseRateAfter, { allowZero: true });
      if (parsed === null) {
        error('La dose finale doit être un nombre positif ou nul (µSv/h).');
        return;
      }
      doseRateAfter = parsed;
    }

    const personnelFunction = form.personnelFunction ? form.personnelFunction : undefined;
    const correctiveActions = form.correctiveActions.trim() ? form.correctiveActions.trim() : undefined;
    const wasteId = form.wasteLabel ? labelToWasteId.get(form.wasteLabel) : undefined;

    setIsSubmitting(true);
    try {
      if (editId) {
        // Les clés undefined sont retirées automatiquement par le dépôt.
        await updateIncident(editId, {
          type: form.type,
          personnelFunction,
          doseRateBefore,
          doseRateAfter,
          correctiveActions,
          wasteId,
        });
        success('Incident mis à jour avec succès.');
        await writeLog(profile.hospitalId, `Modification de l'incident ${editId} (${form.type})`);
      } else {
        const newId = await createIncident({
          date: new Date().toISOString(),
          hospitalId: profile.hospitalId,
          type: form.type,
          personnelFunction,
          doseRateBefore,
          doseRateAfter,
          correctiveActions,
          wasteId,
        });
        success('Incident déclaré avec succès.');
        await writeLog(profile.hospitalId, `Déclaration d'un incident (${form.type}) — réf. ${newId}`);
      }
      resetForm();
    } catch (err) {
      console.error(err);
      error("Échec de l'enregistrement de l'incident. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (incident: Incident) => {
    if (deletingId) return;
    const label = incident.registryNumber ?? incident.id;
    if (!window.confirm(`Supprimer définitivement l'incident ${label} ? Cette action est irréversible.`)) {
      return;
    }
    setDeletingId(incident.id);
    try {
      await deleteIncident(incident.id);
      success('Incident supprimé avec succès.');
      await writeLog(profile.hospitalId, `Suppression de l'incident ${label} (${incident.type})`);
    } catch (err) {
      console.error(err);
      error("Échec de la suppression de l'incident. Veuillez réessayer.");
    } finally {
      setDeletingId(null);
    }
  };

  // Tri par date décroissante par défaut (les incidents les plus récents en premier).
  const sortedIncidents = useMemo<Incident[]>(
    () => [...incidents].sort((a, b) => b.date.localeCompare(a.date)),
    [incidents],
  );

  const wasteDisplayOf = (incident: Incident): string =>
    incident.wasteId ? (wasteIdToLabel.get(incident.wasteId) ?? incident.wasteId) : 'N/A';

  const columns = useMemo<Column<Incident>[]>(
    () => [
      {
        key: 'id',
        header: 'ID',
        render: (incident) => (
          <span className="font-mono text-sm text-accent font-bold">
            {incident.registryNumber ?? incident.id}
          </span>
        ),
        sortValue: (incident) => incident.registryNumber ?? incident.id,
        searchValue: (incident) => incident.registryNumber ?? incident.id,
      },
      {
        key: 'type',
        header: 'Type',
        render: (incident) => (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-black uppercase rounded-full bg-red-500/20 text-red-500">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            {incident.type}
          </span>
        ),
        sortValue: (incident) => incident.type,
        searchValue: (incident) => incident.type,
      },
      {
        key: 'date',
        header: 'Date',
        render: (incident) => (
          <span className="text-xs text-muted">{new Date(incident.date).toLocaleString('fr-FR')}</span>
        ),
        sortValue: (incident) => incident.date,
        csvValue: (incident) => incident.date,
      },
      {
        key: 'personnelFunction',
        header: 'Implication',
        render: (incident) => (
          <span className="text-xs text-primary font-semibold">
            {incident.personnelFunction ?? <span className="text-faint italic">Non renseigné</span>}
          </span>
        ),
        sortValue: (incident) => incident.personnelFunction ?? '',
        searchValue: (incident) => incident.personnelFunction ?? '',
      },
      {
        key: 'waste',
        header: 'Déchet',
        render: (incident) => (
          <span className="text-xs text-primary font-mono">{wasteDisplayOf(incident)}</span>
        ),
        sortValue: (incident) => wasteDisplayOf(incident),
        searchValue: (incident) => wasteDisplayOf(incident),
      },
      {
        key: 'doses',
        header: 'Doses',
        render: (incident) => (
          <div className="text-xs leading-snug">
            <div>
              <span className="text-muted">Initiale&nbsp;: </span>
              <span className="font-black italic text-red-500">{displayOrDash(incident.doseRateBefore)}</span>
              <span className="text-muted"> µSv/h</span>
            </div>
            <div>
              <span className="text-muted">Finale&nbsp;: </span>
              <span className="font-black italic text-green-600">{displayOrDash(incident.doseRateAfter)}</span>
              <span className="text-muted"> µSv/h</span>
            </div>
          </div>
        ),
        sortValue: (incident) => incident.doseRateAfter ?? -1,
        csvValue: (incident) =>
          `Initiale ${displayOrDash(incident.doseRateBefore)} / Finale ${displayOrDash(incident.doseRateAfter)} µSv/h`,
      },
      {
        key: 'correctiveActions',
        header: 'Actions correctives',
        render: (incident) => (
          <p className="text-xs text-primary leading-snug whitespace-pre-wrap max-w-xs">
            {incident.correctiveActions ?? <span className="text-faint italic">Non renseigné</span>}
          </p>
        ),
        searchValue: (incident) => incident.correctiveActions ?? '',
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        render: (incident) => {
          const isDeleting = deletingId === incident.id;
          return (
            <div className="flex justify-end gap-2">
              <IconButton onClick={() => openEdit(incident)} label="Modifier l'incident" variant="info">
                <Edit2 className="w-4 h-4" aria-hidden="true" />
              </IconButton>
              <IconButton
                onClick={() => {
                  if (!isDeleting) void handleDelete(incident);
                }}
                label="Supprimer l'incident"
                variant="danger"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </IconButton>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deletingId, wasteIdToLabel],
  );

  return (
    <div className="space-y-6">
      {/* Bandeau protocole d'urgence */}
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-8 h-8 text-red-500 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-red-500">Protocole d&apos;urgence</h2>
            <p className="text-xs text-muted mt-1 max-w-xl">
              En cas de déversement, contamination ou perte de déchet radioactif : sécuriser et baliser la zone,
              limiter l&apos;exposition du personnel, puis déclarer l&apos;incident sans délai afin de tracer les actions correctives.
            </p>
          </div>
        </div>
        <button
          onClick={() => (isAdding ? resetForm() : openCreate())}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-red-500 text-white font-bold text-sm rounded-lg hover:bg-red-600 transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Déclarer un incident
        </button>
      </div>

      {/* Formulaire ajout / édition */}
      {isAdding && (
        <form onSubmit={handleSubmit} className="bg-surface border border-subtle rounded-2xl p-6 space-y-4">
          <SectionHeader
            title={editId ? "Modifier l'incident" : 'Nouvelle déclaration'}
            description={
              editId
                ? `Référence : ${editId}`
                : "Renseignez le type d'incident ; les autres champs peuvent être complétés plus tard"
            }
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormSelect
              label="Type d'incident"
              name="type"
              value={form.type}
              onChange={handleSelectChange}
              options={settings.incidentTypes}
              required
            />
            <FormSelect
              label="Personnel impliqué (facultatif)"
              name="personnelFunction"
              value={form.personnelFunction}
              onChange={handleSelectChange}
              options={userNames}
            />
            <FormSelect
              label="Déchet concerné (facultatif)"
              name="wasteLabel"
              value={form.wasteLabel}
              onChange={handleSelectChange}
              options={wasteLabels}
            />
            <div className="hidden md:block" aria-hidden="true" />
            <FormInput
              label="Dose initiale (µSv/h) — facultatif"
              name="doseRateBefore"
              value={form.doseRateBefore}
              onChange={handleInputChange}
              type="number"
              step="any"
              min="0"
            />
            <FormInput
              label="Dose finale (µSv/h) — facultatif"
              name="doseRateAfter"
              value={form.doseRateAfter}
              onChange={handleInputChange}
              type="number"
              step="any"
              min="0"
            />
          </div>

          <FormTextArea
            label="Actions correctives (facultatif)"
            name="correctiveActions"
            value={form.correctiveActions}
            onChange={handleTextAreaChange}
            rows={3}
          />

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={resetForm}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-bold text-muted hover:text-primary rounded-lg transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              {isSubmitting
                ? 'Enregistrement…'
                : editId
                  ? 'Mettre à jour'
                  : "Enregistrer l'incident"}
            </button>
          </div>
        </form>
      )}

      {/* Liste des incidents */}
      <DataTable
        columns={columns}
        rows={sortedIncidents}
        getRowKey={(incident) => incident.id}
        searchPlaceholder="Rechercher (ID, type, personne, déchet)…"
        pageSize={10}
        emptyMessage="Aucun incident enregistré. Espérons que cela dure."
        exportFileName="incidents"
      />
    </div>
  );
}
