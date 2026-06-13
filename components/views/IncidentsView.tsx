'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Edit2, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { Incident, WasteItem, User, IncidentType } from '@/types';
import { parsePositiveNumber } from '@/lib/validation/schemas';
import { createIncident, updateIncident, deleteIncident } from '@/lib/repositories/incidentRepository';
import { writeLog } from '@/lib/repositories/logRepository';
import { useToast } from '@/components/ui/Toast';
import { FormSelect, FormInput, FormTextArea } from '@/components/ui/Form';
import { IconButton, EmptyState, SectionHeader } from '@/components/ui/Primitives';

interface IncidentsViewProps {
  incidents: Incident[];
  wasteItems: WasteItem[];
  users: User[];
  profile: User;
}

const INCIDENT_TYPES: IncidentType[] = ['Déversement accidentel', 'Contamination', 'Perte de déchet'];

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

export function IncidentsView({ incidents, wasteItems, users, profile }: IncidentsViewProps) {
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
      personnelFunction: incident.personnelFunction,
      wasteLabel: incident.wasteId ? (wasteIdToLabel.get(incident.wasteId) ?? '') : '',
      doseRateBefore: String(incident.doseRateBefore),
      doseRateAfter: String(incident.doseRateAfter),
      correctiveActions: incident.correctiveActions,
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

    if (!form.type) {
      error("Veuillez sélectionner le type d'incident.");
      return;
    }
    if (!form.personnelFunction) {
      error('Veuillez sélectionner le personnel impliqué.');
      return;
    }
    if (!form.correctiveActions.trim()) {
      error('Les actions correctives sont obligatoires.');
      return;
    }

    const doseRateBefore = parsePositiveNumber(form.doseRateBefore, { allowZero: true });
    if (doseRateBefore === null) {
      error('La dose initiale doit être un nombre positif ou nul (µSv/h).');
      return;
    }
    const doseRateAfter = parsePositiveNumber(form.doseRateAfter, { allowZero: true });
    if (doseRateAfter === null) {
      error('La dose finale doit être un nombre positif ou nul (µSv/h).');
      return;
    }

    const wasteId = form.wasteLabel ? labelToWasteId.get(form.wasteLabel) : undefined;

    setIsSubmitting(true);
    try {
      if (editId) {
        await updateIncident(editId, {
          type: form.type as IncidentType,
          personnelFunction: form.personnelFunction,
          doseRateBefore,
          doseRateAfter,
          correctiveActions: form.correctiveActions.trim(),
          wasteId,
        });
        success('Incident mis à jour avec succès.');
        await writeLog(profile.hospitalId, `Modification de l'incident ${editId} (${form.type})`);
      } else {
        const newId = await createIncident({
          date: new Date().toISOString(),
          hospitalId: profile.hospitalId,
          personnelFunction: form.personnelFunction,
          type: form.type as IncidentType,
          doseRateBefore,
          doseRateAfter,
          correctiveActions: form.correctiveActions.trim(),
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
            description={editId ? `Référence : ${editId}` : "Renseignez les circonstances de l'incident"}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormSelect
              label="Type d'incident"
              name="type"
              value={form.type}
              onChange={handleSelectChange}
              options={INCIDENT_TYPES}
              required
            />
            <FormSelect
              label="Personnel impliqué"
              name="personnelFunction"
              value={form.personnelFunction}
              onChange={handleSelectChange}
              options={userNames}
              required
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
              label="Dose initiale (µSv/h)"
              name="doseRateBefore"
              value={form.doseRateBefore}
              onChange={handleInputChange}
              type="number"
              step="any"
              min="0"
              required
            />
            <FormInput
              label="Dose finale (µSv/h)"
              name="doseRateAfter"
              value={form.doseRateAfter}
              onChange={handleInputChange}
              type="number"
              step="any"
              min="0"
              required
            />
          </div>

          <FormTextArea
            label="Actions correctives"
            name="correctiveActions"
            value={form.correctiveActions}
            onChange={handleTextAreaChange}
            required
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
      {incidents.length === 0 ? (
        <div className="bg-surface border border-subtle rounded-2xl">
          <EmptyState message="Aucun incident enregistré. Espérons que cela dure." />
        </div>
      ) : (
        <div className="space-y-4">
          {incidents.map((incident) => {
            const idLabel = incident.registryNumber ?? incident.id;
            const wasteDisplay = incident.wasteId
              ? (wasteIdToLabel.get(incident.wasteId) ?? incident.wasteId)
              : 'N/A';
            const isDeleting = deletingId === incident.id;
            return (
              <div key={incident.id} className="bg-surface border border-subtle rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-sm text-accent font-bold">{idLabel}</span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-black uppercase rounded-full bg-red-500/20 text-red-500">
                        <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                        {incident.type}
                      </span>
                      <span className="text-xs text-muted">
                        {new Date(incident.date).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      Implication : <span className="text-primary font-semibold">{incident.personnelFunction}</span>
                    </p>
                    <p className="text-xs text-muted">
                      Déchet : <span className="text-primary font-mono">{wasteDisplay}</span>
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <IconButton onClick={() => openEdit(incident)} label="Modifier l'incident" variant="info">
                      <Edit2 className="w-4 h-4" aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      onClick={() => { if (!isDeleting) void handleDelete(incident); }}
                      label="Supprimer l'incident"
                      variant="danger"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </IconButton>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-surface-2 border border-subtle rounded-xl p-3">
                    <div className="text-xs uppercase font-bold tracking-widest text-muted mb-1">Dose initiale</div>
                    <div className="text-lg font-black italic text-red-500">{incident.doseRateBefore} µSv/h</div>
                  </div>
                  <div className="bg-surface-2 border border-subtle rounded-xl p-3">
                    <div className="text-xs uppercase font-bold tracking-widest text-muted mb-1">Actions correctives</div>
                    <p className="text-xs text-primary leading-snug whitespace-pre-wrap">{incident.correctiveActions}</p>
                  </div>
                  <div className="bg-surface-2 border border-subtle rounded-xl p-3">
                    <div className="text-xs uppercase font-bold tracking-widest text-muted mb-1">Dose finale</div>
                    <div className="text-lg font-black italic text-green-600">{incident.doseRateAfter} µSv/h</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
