'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Edit2, X } from 'lucide-react';
import type { WasteItem, User, Radionuclide, WasteType } from '@/types';
import { validateWasteForm } from '@/lib/validation/schemas';
import {
  RADIONUCLIDE_OPTIONS,
  referenceHalfLife,
  referenceClearanceLevel,
} from '@/lib/physics/clearanceLevels';
import {
  createWasteItem,
  updateWasteItem,
  deleteWasteItem,
} from '@/lib/repositories/wasteRepository';
import { writeLog } from '@/lib/repositories/logRepository';
import { useToast } from '@/components/ui/Toast';
import { FormInput, FormSelect } from '@/components/ui/Form';
import {
  IconButton,
  StatusBadge,
  SectionHeader,
} from '@/components/ui/Primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';

const ORIGIN_SERVICE_OPTIONS: string[] = [
  'labo chaud',
  'salle d’injection',
  'salle d’attente chaude',
  'salle d’acquisition',
  'salle de consultation chaude',
  'salle d’interprétation',
];

const TYPE_OPTIONS: string[] = [
  'solide',
  'liquide',
  'biologique',
  'seringue',
  'flacon',
  'tubulure',
  'gants',
  'compresses',
  'autres',
];

/** Date-heure locale courante tronquée à la minute, format attendu par un input datetime-local. */
function nowLocal16(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface FormState {
  originService: string;
  responsibleOperator: string;
  type: string;
  radionuclide: string;
  initialActivity: string;
  mass: string;
  measureDate: string;
  halfLife: string;
  clearanceLevelBqPerG: string;
  doseRateContact: string;
  doseRate1m: string;
}

function emptyForm(profile: User): FormState {
  return {
    originService: '',
    responsibleOperator: profile.name,
    type: '',
    radionuclide: '',
    initialActivity: '',
    mass: '',
    measureDate: nowLocal16(),
    halfLife: '',
    clearanceLevelBqPerG: '',
    doseRateContact: '',
    doseRate1m: '',
  };
}

interface IdentificationViewProps {
  wasteItems: WasteItem[];
  users: User[];
  profile: User;
}

export function IdentificationView({ wasteItems, users, profile }: IdentificationViewProps) {
  const { success, error } = useToast();

  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(profile));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const operatorOptions = useMemo<string[]>(() => users.map((u) => u.name), [users]);
  const radionuclideOptions = useMemo<string[]>(() => [...RADIONUCLIDE_OPTIONS], []);

  const storageItems = useMemo<WasteItem[]>(
    () => wasteItems.filter((w) => w.status === 'stockage'),
    [wasteItems],
  );

  const clearancePlaceholder = useMemo<string>(() => {
    if (!form.radionuclide || form.radionuclide === 'autres') return 'ex. 100';
    const ref = referenceClearanceLevel(form.radionuclide as Radionuclide);
    return ref === null ? 'ex. 100' : `Référence : ${ref}`;
  }, [form.radionuclide]);

  function resetForm() {
    setForm(emptyForm(profile));
    setFieldErrors({});
    setEditId(null);
    setIsAdding(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const { name, value } = e.target;
    if (name === 'radionuclide') {
      const rn = value as Radionuclide;
      const half = value && value !== 'autres' ? referenceHalfLife(rn) : null;
      setForm((prev) => ({
        ...prev,
        radionuclide: value,
        halfLife: half === null ? (value === 'autres' ? '' : prev.halfLife) : String(half),
      }));
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function startEdit(item: WasteItem) {
    setForm({
      originService: item.originService,
      responsibleOperator: item.responsibleOperator,
      type: item.type,
      radionuclide: item.radionuclide,
      initialActivity: String(item.initialActivity),
      mass: String(item.mass),
      measureDate: toLocal16(item.measureDate),
      halfLife: String(item.halfLife),
      clearanceLevelBqPerG: item.clearanceLevelBqPerG !== undefined ? String(item.clearanceLevelBqPerG) : '',
      doseRateContact: String(item.doseRateContact),
      doseRate1m: String(item.doseRate1m),
    });
    setFieldErrors({});
    setEditId(item.id);
    setIsAdding(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;

    const result = validateWasteForm({
      originService: form.originService,
      type: form.type,
      radionuclide: form.radionuclide,
      initialActivity: form.initialActivity,
      mass: form.mass,
      halfLife: form.halfLife,
      measureDate: form.measureDate,
      doseRateContact: form.doseRateContact,
      doseRate1m: form.doseRate1m,
      clearanceLevelBqPerG: form.clearanceLevelBqPerG,
    });

    if (!result.ok) {
      const map: Record<string, string> = {};
      result.errors.forEach((err) => {
        if (!map[err.field]) map[err.field] = err.message;
      });
      setFieldErrors(map);
      error('Veuillez corriger les champs invalides.');
      return;
    }

    setFieldErrors({});
    const v = result.value!;
    setIsSubmitting(true);
    try {
      if (editId) {
        await updateWasteItem(editId, {
          originService: form.originService,
          responsibleOperator: form.responsibleOperator,
          type: form.type as WasteType,
          radionuclide: form.radionuclide as Radionuclide,
          initialActivity: v.initialActivity,
          mass: v.mass,
          measureDate: v.measureDate,
          doseRateContact: v.doseRateContact,
          doseRate1m: v.doseRate1m,
          halfLife: v.halfLife,
          clearanceLevelBqPerG: v.clearanceLevelBqPerG,
        });
        success('Déchet mis à jour.');
        await writeLog(profile.hospitalId, `Modification du déchet ${editId} (${form.radionuclide})`);
      } else {
        const nowIso = new Date().toISOString();
        const input: Omit<WasteItem, 'id' | 'registryNumber'> = {
          createdAt: nowIso,
          hospitalId: profile.hospitalId,
          originService: form.originService,
          responsibleOperator: form.responsibleOperator,
          type: form.type as WasteType,
          radionuclide: form.radionuclide as Radionuclide,
          initialActivity: v.initialActivity,
          mass: v.mass,
          measureDate: v.measureDate,
          doseRateContact: v.doseRateContact,
          doseRate1m: v.doseRate1m,
          halfLife: v.halfLife,
          clearanceLevelBqPerG: v.clearanceLevelBqPerG,
          storageEntryDate: nowIso,
          storageResponsible: profile.name,
          expectedDecayDuration: Math.ceil((10 * v.halfLife) / 24),
          status: 'stockage',
        };
        const id = await createWasteItem(input);
        success('Déchet enregistré et placé en stockage.');
        await writeLog(profile.hospitalId, `Enregistrement d'un déchet ${form.radionuclide} (id ${id})`);
      }
      resetForm();
    } catch {
      error(
        editId
          ? 'Échec de la mise à jour du déchet. Veuillez réessayer.'
          : "Échec de l'enregistrement du déchet. Veuillez réessayer.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(item: WasteItem) {
    if (deletingId) return;
    const label = item.registryNumber ?? item.id;
    if (!window.confirm(`Supprimer définitivement le déchet ${label} ? Les incidents rattachés seront aussi supprimés.`)) {
      return;
    }
    setDeletingId(item.id);
    try {
      await deleteWasteItem(item.id);
      success(`Déchet ${label} supprimé.`);
      await writeLog(profile.hospitalId, `Suppression du déchet ${label}`);
    } catch {
      error('Échec de la suppression du déchet. Veuillez réessayer.');
    } finally {
      setDeletingId(null);
    }
  }

  const columns = useMemo<Column<WasteItem>[]>(() => [
    {
      key: 'id',
      header: 'ID',
      render: (item) => (
        <span className="font-mono text-xs text-accent">{item.registryNumber ?? item.id}</span>
      ),
      sortValue: (item) => item.registryNumber ?? item.id,
      searchValue: (item) => item.registryNumber ?? item.id,
      csvValue: (item) => item.registryNumber ?? item.id,
    },
    {
      key: 'info',
      header: 'Info',
      render: (item) => (
        <div>
          <div className="capitalize font-bold text-primary">{item.type}</div>
          <div className="text-xs text-muted capitalize">{item.originService}</div>
          <div className="text-xs text-faint">{item.responsibleOperator}</div>
        </div>
      ),
      searchValue: (item) => `${item.type} ${item.originService} ${item.responsibleOperator}`,
      csvValue: (item) => item.type,
    },
    {
      key: 'isotope',
      header: 'Isotope',
      render: (item) => (
        <div>
          <div className="font-bold text-primary">{item.radionuclide}</div>
          <div className="text-xs text-muted">T½ : {item.halfLife} h</div>
        </div>
      ),
      sortValue: (item) => item.radionuclide,
      searchValue: (item) => item.radionuclide,
      csvValue: (item) => item.radionuclide,
    },
    {
      key: 'mesure',
      header: 'Mesure',
      render: (item) => (
        <div>
          <div className="text-primary">{item.initialActivity} MBq</div>
          <div className="text-xs text-muted">
            {new Date(item.measureDate).toLocaleString('fr-FR')}
          </div>
          <div className="text-xs text-faint">masse {item.mass} g</div>
        </div>
      ),
      sortValue: (item) => item.initialActivity,
      csvValue: (item) => item.initialActivity,
    },
    {
      key: 'statut',
      header: 'Statut',
      render: (item) => <StatusBadge status={item.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-2">
          <IconButton
            variant="info"
            label={`Modifier le déchet ${item.registryNumber ?? item.id}`}
            onClick={() => startEdit(item)}
          >
            <Edit2 className="w-4 h-4" aria-hidden="true" />
          </IconButton>
          <IconButton
            variant="danger"
            label={`Supprimer le déchet ${item.registryNumber ?? item.id}`}
            onClick={() => {
              if (deletingId !== item.id) void handleDelete(item);
            }}
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </IconButton>
        </div>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [deletingId]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Identification des déchets"
        description="Enregistrement et caractérisation radiophysique des déchets en stockage."
        action={
          isAdding ? (
            <button
              type="button"
              onClick={resetForm}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-black/5 dark:bg-white/5 text-muted hover:text-primary font-bold text-sm transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
              Annuler
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setForm(emptyForm(profile));
                setFieldErrors({});
                setEditId(null);
                setIsAdding(true);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-black font-bold text-sm hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Enregistrer un Déchet
            </button>
          )
        }
      />

      {isAdding && (
        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-subtle rounded-2xl p-6 space-y-5"
        >
          <h3 className="text-sm font-black italic uppercase text-primary">
            {editId ? 'Modifier le déchet' : 'Nouveau déchet'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormSelect
              label="Service d'origine"
              name="originService"
              value={form.originService}
              onChange={handleSelectChange}
              options={ORIGIN_SERVICE_OPTIONS}
              required
              error={fieldErrors.originService}
            />
            <FormSelect
              label="Opérateur responsable"
              name="responsibleOperator"
              value={form.responsibleOperator}
              onChange={handleSelectChange}
              options={operatorOptions}
              required
              error={fieldErrors.responsibleOperator}
            />
            <FormSelect
              label="Type de déchet"
              name="type"
              value={form.type}
              onChange={handleSelectChange}
              options={TYPE_OPTIONS}
              required
              error={fieldErrors.type}
            />
            <FormSelect
              label="Radionucléide"
              name="radionuclide"
              value={form.radionuclide}
              onChange={handleSelectChange}
              options={radionuclideOptions}
              required
              error={fieldErrors.radionuclide}
            />
            <FormInput
              label="Activité initiale (MBq)"
              name="initialActivity"
              value={form.initialActivity}
              onChange={handleInputChange}
              type="number"
              step="any"
              min="0"
              required
              error={fieldErrors.initialActivity}
            />
            <FormInput
              label="Masse du colis (g)"
              name="mass"
              value={form.mass}
              onChange={handleInputChange}
              type="number"
              step="any"
              min="0"
              required
              error={fieldErrors.mass}
            />
            <FormInput
              label="Date et heure de mesure"
              name="measureDate"
              value={form.measureDate}
              onChange={handleInputChange}
              type="datetime-local"
              required
              error={fieldErrors.measureDate}
            />
            <FormInput
              label="Demi-vie physique (h)"
              name="halfLife"
              value={form.halfLife}
              onChange={handleInputChange}
              type="number"
              step="any"
              min="0"
              required
              error={fieldErrors.halfLife}
            />
            <FormInput
              label="Niveau de libération (Bq/g) — optionnel"
              name="clearanceLevelBqPerG"
              value={form.clearanceLevelBqPerG}
              onChange={handleInputChange}
              type="number"
              step="any"
              min="0"
              placeholder={clearancePlaceholder}
              error={fieldErrors.clearanceLevelBqPerG}
            />
            <FormInput
              label="Débit de dose au contact (µSv/h)"
              name="doseRateContact"
              value={form.doseRateContact}
              onChange={handleInputChange}
              type="number"
              step="any"
              min="0"
              required
              error={fieldErrors.doseRateContact}
            />
            <FormInput
              label="Débit de dose à 1 m (µSv/h) — optionnel"
              name="doseRate1m"
              value={form.doseRate1m}
              onChange={handleInputChange}
              type="number"
              step="any"
              min="0"
              error={fieldErrors.doseRate1m}
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-black font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              {isSubmitting
                ? 'Enregistrement…'
                : editId
                  ? 'Mettre à jour'
                  : 'Enregistrer le déchet'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-lg bg-black/5 dark:bg-white/5 text-muted hover:text-primary font-bold text-sm transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="bg-surface border border-subtle rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold uppercase text-primary">Déchets en stockage</h3>
          <span className="text-xs text-muted">({storageItems.length})</span>
        </div>

        <DataTable
          columns={columns}
          rows={storageItems}
          getRowKey={(r) => r.id}
          searchPlaceholder="Rechercher (ID, type, isotope, opérateur)…"
          pageSize={10}
          emptyMessage="Aucun déchet en stockage pour le moment."
          exportFileName="dechets_stockage"
        />
      </div>
    </div>
  );
}

/** Convertit une date ISO en valeur locale tronquée à la minute pour un input datetime-local. */
function toLocal16(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return nowLocal16();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
