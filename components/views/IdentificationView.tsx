'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Edit2, X, Eye } from 'lucide-react';
import type { WasteItem, User, AppSettings, Radionuclide, WasteType, WasteStatus } from '@/types';
import { validateWasteForm } from '@/lib/validation/schemas';
import {
  RADIONUCLIDE_OPTIONS,
  referenceHalfLife,
  referenceClearanceLevel,
} from '@/lib/physics/clearanceLevels';
import { evaluateConformity, netExitDoseRate, netMassG } from '@/lib/physics/decay';
import {
  createWasteItem,
  updateWasteItem,
  deleteWasteItem,
} from '@/lib/repositories/wasteRepository';
import { writeLog } from '@/lib/repositories/logRepository';
import { useToast } from '@/components/ui/Toast';
import { FormInput, FormSelect } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import {
  IconButton,
  StatusBadge,
  SectionHeader,
} from '@/components/ui/Primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';

/** Date-heure locale courante tronquée à la minute, format attendu par un input datetime-local. */
function nowLocal16(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convertit un nombre éventuellement absent en chaîne de saisie (vide si undefined). */
function numToInput(n: number | undefined): string {
  return n === undefined ? '' : String(n);
}

/** Convertit une valeur d'input datetime-local en ISO, ou undefined si vide/invalide. */
function parseLocalIso(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Convertit une saisie numérique en nombre, ou undefined si vide/invalide. */
function parseNum(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Nombre formaté à la française. Un vrai zéro s'affiche « 0 » ; une valeur non nulle mais trop
 * petite pour être visible au nombre de décimales demandé (ex. 0,004 avec digits=2) est rendue en
 * notation scientifique (« 4,0e-3 ») plutôt qu'un « 0 » trompeur sur une fiche documentaire.
 */
function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  if (Math.abs(n) < 0.5 * Math.pow(10, -digits)) {
    return n.toExponential(1).replace('.', ',');
  }
  return n.toLocaleString('fr-FR', { maximumFractionDigits: digits });
}

interface FormState {
  originService: string;
  responsibleOperator: string;
  type: string;
  radionuclide: string;
  initialActivity: string;
  mass: string;
  containerTare: string;
  measureDate: string;
  halfLife: string;
  clearanceLevelBqPerG: string;
  releaseDoseThreshold: string;
  storageEntryDate: string;
  backgroundDoseRate: string;
  doseRateContact: string;
  doseRate1m: string;
  dailyElution: string;
  dailyPatientCount: string;
  dailyExamTypes: string[];
  historicalEliminated: boolean;
  histElimDate: string;
  histElimMode: string;
  histExitBackground: string;
  histExitDose: string;
  histExitDose1m: string;
  histController: string;
  histConformity: string;
}

function emptyForm(profile: User): FormState {
  return {
    originService: '',
    responsibleOperator: profile.name,
    type: '',
    radionuclide: '',
    initialActivity: '',
    mass: '',
    containerTare: '',
    measureDate: nowLocal16(),
    halfLife: '',
    clearanceLevelBqPerG: '',
    releaseDoseThreshold: '0.5',
    storageEntryDate: nowLocal16(),
    backgroundDoseRate: '',
    doseRateContact: '',
    doseRate1m: '',
    dailyElution: '',
    dailyPatientCount: '',
    dailyExamTypes: [],
    historicalEliminated: false,
    histElimDate: nowLocal16(),
    histElimMode: '',
    histExitBackground: '',
    histExitDose: '',
    histExitDose1m: '',
    histController: profile.name,
    histConformity: 'Oui',
  };
}

interface IdentificationViewProps {
  wasteItems: WasteItem[];
  users: User[];
  profile: User;
  settings: AppSettings;
}

export function IdentificationView({ wasteItems, users, profile, settings }: IdentificationViewProps) {
  const { success, error } = useToast();

  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(profile));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Statut du déchet en cours d'édition (permet de compléter aussi les déchets libérés/éliminés).
  const [editStatus, setEditStatus] = useState<WasteStatus | null>(null);
  const [statusFilter, setStatusFilter] = useState<'tous' | 'stockage' | 'liberable' | 'elimine'>('tous');
  const [detailId, setDetailId] = useState<string | null>(null);

  const operatorOptions = useMemo<string[]>(() => users.map((u) => u.name), [users]);
  const radionuclideOptions = useMemo<string[]>(() => [...RADIONUCLIDE_OPTIONS], []);
  const originServiceOptions = useMemo<string[]>(() => settings.originServices, [settings.originServices]);
  const typeOptions = useMemo<string[]>(() => settings.wasteTypes, [settings.wasteTypes]);
  const examTypeOptions = useMemo<string[]>(() => settings.examTypes, [settings.examTypes]);

  function toggleExamType(exam: string) {
    setForm((prev) => ({
      ...prev,
      dailyExamTypes: prev.dailyExamTypes.includes(exam)
        ? prev.dailyExamTypes.filter((e) => e !== exam)
        : [...prev.dailyExamTypes, exam],
    }));
  }

  // Tous les déchets sont affichables/éditables (y compris libérés et éliminés) afin de
  // pouvoir compléter a posteriori les données manquantes (activité, masse, dates…).
  const visibleItems = useMemo<WasteItem[]>(
    () => (statusFilter === 'tous' ? wasteItems : wasteItems.filter((w) => w.status === statusFilter)),
    [wasteItems, statusFilter],
  );

  const detailItem = useMemo<WasteItem | null>(
    () => wasteItems.find((w) => w.id === detailId) ?? null,
    [wasteItems, detailId],
  );

  const clearancePlaceholder = useMemo<string>(() => {
    if (!form.radionuclide || form.radionuclide === 'autres') return 'ex. 100';
    const ref = referenceClearanceLevel(form.radionuclide as Radionuclide);
    return ref === null ? 'ex. 100' : `Référence : ${ref}`;
  }, [form.radionuclide]);

  // Masse nette recalculée à la volée, tant que la tare reste cohérente avec la masse brute.
  const netMassHint = useMemo<string | null>(() => {
    const gross = parseNum(form.mass);
    const tare = parseNum(form.containerTare);
    if (gross === undefined || tare === undefined) return null;
    const net = netMassG({ mass: gross, containerTare: tare });
    if (net === null) return null;
    // netMassG renvoie la masse BRUTE quand la tare est absente/<=0 : ne pas l'étiqueter « nette ».
    return tare > 0
      ? `Masse nette (brute − tare) : ${fmtNum(net, 2)} g`
      : `Masse nette : ${fmtNum(net, 2)} g (= masse brute, tare non renseignée)`;
  }, [form.mass, form.containerTare]);

  function resetForm() {
    setForm(emptyForm(profile));
    setFieldErrors({});
    setEditId(null);
    setEditStatus(null);
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
      const known = value !== '' && value !== 'autres';
      const half = known ? referenceHalfLife(rn) : null;
      const clearance = known ? referenceClearanceLevel(rn) : null;
      setForm((prev) => ({
        ...prev,
        radionuclide: value,
        halfLife: half === null ? (value === 'autres' ? '' : prev.halfLife) : String(half),
        clearanceLevelBqPerG: clearance === null ? (value === 'autres' ? '' : prev.clearanceLevelBqPerG) : String(clearance),
      }));
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function startEdit(item: WasteItem) {
    setForm({
      originService: item.originService ?? '',
      responsibleOperator: item.responsibleOperator ?? profile.name,
      type: item.type,
      radionuclide: item.radionuclide,
      initialActivity: numToInput(item.initialActivity),
      mass: numToInput(item.mass),
      containerTare: numToInput(item.containerTare),
      measureDate: item.measureDate ? toLocal16(item.measureDate) : '',
      halfLife: numToInput(item.halfLife),
      clearanceLevelBqPerG: numToInput(item.clearanceLevelBqPerG),
      releaseDoseThreshold: item.releaseDoseThreshold != null ? String(item.releaseDoseThreshold) : '0.5',
      backgroundDoseRate: numToInput(item.backgroundDoseRate),
      doseRateContact: numToInput(item.doseRateContact),
      doseRate1m: numToInput(item.doseRate1m),
      dailyElution: numToInput(item.dailyElution),
      dailyPatientCount: numToInput(item.dailyPatientCount),
      dailyExamTypes: item.dailyExamTypes ?? [],
      storageEntryDate: item.storageEntryDate ? toLocal16(item.storageEntryDate) : nowLocal16(),
      historicalEliminated: false,
      // Données de sortie existantes (pour compléter/corriger un déchet déjà libéré ou éliminé).
      histElimDate: item.eliminationDate ? toLocal16(item.eliminationDate) : nowLocal16(),
      histElimMode: item.eliminationMode ?? '',
      histExitBackground: numToInput(item.exitBackgroundDoseRate),
      histExitDose: numToInput(item.exitDoseRate),
      histExitDose1m: numToInput(item.exitDoseRate1m),
      histController: item.exitController ?? profile.name,
      histConformity: item.exitConformity === false ? 'Non' : 'Oui',
    });
    setFieldErrors({});
    setEditId(item.id);
    setEditStatus(item.status);
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
      containerTare: form.containerTare,
      halfLife: form.halfLife,
      measureDate: form.measureDate,
      backgroundDoseRate: form.backgroundDoseRate,
      doseRateContact: form.doseRateContact,
      doseRate1m: form.doseRate1m,
      clearanceLevelBqPerG: form.clearanceLevelBqPerG,
      releaseDoseThreshold: form.releaseDoseThreshold,
      dailyElution: form.dailyElution,
      dailyPatientCount: form.dailyPatientCount,
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
    const responsibleOperator = form.responsibleOperator.trim() ? form.responsibleOperator : undefined;
    const dailyExamTypes = form.dailyExamTypes.length > 0 ? form.dailyExamTypes : undefined;
    setIsSubmitting(true);
    try {
      if (editId) {
        const isOut = editStatus === 'liberable' || editStatus === 'elimine';
        const elimIsoEdit = parseLocalIso(form.histElimDate);
        const storageEntryIso = parseLocalIso(form.storageEntryDate);
        const patch: Partial<WasteItem> = {
          type: form.type as WasteType,
          radionuclide: form.radionuclide as Radionuclide,
          originService: v.originService,
          responsibleOperator,
          initialActivity: v.initialActivity,
          mass: v.mass,
          containerTare: v.containerTare,
          measureDate: v.measureDate,
          backgroundDoseRate: v.backgroundDoseRate,
          doseRateContact: v.doseRateContact,
          doseRate1m: v.doseRate1m,
          halfLife: v.halfLife,
          clearanceLevelBqPerG: v.clearanceLevelBqPerG,
          releaseDoseThreshold: v.releaseDoseThreshold,
          storageEntryDate: storageEntryIso,
          dailyElution: v.dailyElution,
          dailyPatientCount: v.dailyPatientCount,
          dailyExamTypes,
          // Données de sortie : modifiables même une fois le déchet libéré / éliminé.
          ...(isOut ? {
            eliminationDate: elimIsoEdit,
            exitControlDate: elimIsoEdit,
            eliminationMode: form.histElimMode || undefined,
            exitBackgroundDoseRate: parseNum(form.histExitBackground),
            exitDoseRate: parseNum(form.histExitDose),
            exitDoseRate1m: parseNum(form.histExitDose1m),
            exitController: form.histController || undefined,
            eliminationResponsible: form.histController || undefined,
            exitConformity: form.histConformity !== 'Non',
          } : {}),
        };
        // Champs facultatifs VIDÉS par l'utilisateur alors qu'ils avaient une valeur : à effacer
        // explicitement (patch=undefined ne supprime pas ; une tare fautive laissée en base
        // fausserait l'activité massique). La conformité déclarée (select) n'est jamais vidée.
        const original = wasteItems.find((w) => w.id === editId);
        const clearedKeys: (keyof WasteItem)[] = [];
        if (original) {
          const clearIfEmptied = (key: keyof WasteItem, newVal: unknown) => {
            if (original[key] !== undefined && (newVal === undefined || newVal === '')) {
              clearedKeys.push(key);
            }
          };
          clearIfEmptied('initialActivity', v.initialActivity);
          clearIfEmptied('mass', v.mass);
          clearIfEmptied('containerTare', v.containerTare);
          clearIfEmptied('halfLife', v.halfLife);
          clearIfEmptied('clearanceLevelBqPerG', v.clearanceLevelBqPerG);
          clearIfEmptied('releaseDoseThreshold', v.releaseDoseThreshold);
          clearIfEmptied('backgroundDoseRate', v.backgroundDoseRate);
          clearIfEmptied('doseRateContact', v.doseRateContact);
          clearIfEmptied('doseRate1m', v.doseRate1m);
          clearIfEmptied('dailyElution', v.dailyElution);
          clearIfEmptied('dailyPatientCount', v.dailyPatientCount);
          clearIfEmptied('measureDate', v.measureDate);
          clearIfEmptied('originService', v.originService);
          clearIfEmptied('responsibleOperator', responsibleOperator);
          clearIfEmptied('dailyExamTypes', dailyExamTypes);
          clearIfEmptied('storageEntryDate', storageEntryIso);
          if (isOut) {
            clearIfEmptied('eliminationDate', elimIsoEdit);
            clearIfEmptied('exitControlDate', elimIsoEdit);
            clearIfEmptied('eliminationMode', form.histElimMode || undefined);
            clearIfEmptied('eliminationResponsible', form.histController || undefined);
            clearIfEmptied('exitController', form.histController || undefined);
            clearIfEmptied('exitBackgroundDoseRate', parseNum(form.histExitBackground));
            clearIfEmptied('exitDoseRate', parseNum(form.histExitDose));
            clearIfEmptied('exitDoseRate1m', parseNum(form.histExitDose1m));
          }
        }
        await updateWasteItem(editId, patch, clearedKeys);
        success('Déchet mis à jour.');
        await writeLog(profile.hospitalId, `Modification du déchet ${editId} (${form.radionuclide})${isOut ? ' — données de sortie incluses' : ''}`);
      } else {
        const NOW_ISO = new Date().toISOString();
        const hist = form.historicalEliminated;
        const elimIso = hist ? (form.histElimDate ? new Date(form.histElimDate).toISOString() : NOW_ISO) : undefined;
        const input: Omit<WasteItem, 'id' | 'registryNumber'> = {
          createdAt: NOW_ISO,
          hospitalId: profile.hospitalId,
          type: form.type as WasteType,
          radionuclide: form.radionuclide as Radionuclide,
          status: hist ? 'elimine' : 'stockage',
          originService: v.originService,
          responsibleOperator,
          initialActivity: v.initialActivity,
          mass: v.mass,
          containerTare: v.containerTare,
          measureDate: v.measureDate,
          backgroundDoseRate: v.backgroundDoseRate,
          doseRateContact: v.doseRateContact,
          doseRate1m: v.doseRate1m,
          halfLife: v.halfLife,
          clearanceLevelBqPerG: v.clearanceLevelBqPerG,
          releaseDoseThreshold: v.releaseDoseThreshold,
          storageEntryDate: parseLocalIso(form.storageEntryDate) ?? (hist ? (v.measureDate ?? elimIso) : NOW_ISO),
          storageResponsible: profile.name,
          expectedDecayDuration: v.halfLife !== undefined ? Math.ceil((10 * v.halfLife) / 24) : undefined,
          dailyElution: v.dailyElution,
          dailyPatientCount: v.dailyPatientCount,
          dailyExamTypes,
          ...(hist ? {
            eliminationDate: elimIso,
            exitControlDate: elimIso,
            eliminationMode: form.histElimMode || undefined,
            exitBackgroundDoseRate: parseNum(form.histExitBackground),
            exitDoseRate: parseNum(form.histExitDose),
            exitDoseRate1m: parseNum(form.histExitDose1m),
            eliminationResponsible: form.histController || profile.name,
            exitController: form.histController || profile.name,
            exitConformity: form.histConformity !== 'Non',
            exitSignedBy: profile.email,
          } : {}),
        };
        const id = await createWasteItem(input);
        success(hist ? 'Déchet historique enregistré comme éliminé.' : 'Déchet enregistré et placé en stockage.');
        await writeLog(profile.hospitalId, hist
          ? `Import historique : déchet ${form.radionuclide} enregistré comme ÉLIMINÉ (id ${id})`
          : `Enregistrement d'un déchet ${form.radionuclide} (id ${id})`);
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
          <div className="text-xs text-muted capitalize">{item.originService ?? '—'}</div>
          <div className="text-xs text-faint">{item.responsibleOperator ?? '—'}</div>
        </div>
      ),
      searchValue: (item) => `${item.type} ${item.originService ?? ''} ${item.responsibleOperator ?? ''}`,
      csvValue: (item) => item.type,
    },
    {
      key: 'isotope',
      header: 'Isotope',
      render: (item) => (
        <div>
          <div className="font-bold text-primary">{item.radionuclide}</div>
          <div className="text-xs text-muted">T½ : {item.halfLife !== undefined ? `${item.halfLife} h` : '—'}</div>
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
          <div className="text-primary">{item.initialActivity !== undefined ? `${item.initialActivity} MBq` : '—'}</div>
          <div className="text-xs text-muted">
            {item.measureDate ? new Date(item.measureDate).toLocaleString('fr-FR') : '—'}
          </div>
          <div className="text-xs text-faint">masse {item.mass !== undefined ? `${item.mass} g` : '—'}</div>
        </div>
      ),
      sortValue: (item) => item.initialActivity ?? 0,
      csvValue: (item) => (item.initialActivity !== undefined ? item.initialActivity : ''),
    },
    {
      key: 'jour',
      header: 'Activité du jour',
      searchValue: (item) => (item.dailyExamTypes ?? []).join(' '),
      csvValue: (item) => [
        item.dailyPatientCount != null ? `Patients:${item.dailyPatientCount}` : '',
        item.dailyElution != null ? `Elution:${item.dailyElution}MBq` : '',
        item.dailyExamTypes?.length ? `Examens:${item.dailyExamTypes.join('/')}` : '',
      ].filter(Boolean).join(' '),
      render: (item) => {
        const hasAny = item.dailyElution != null
          || item.dailyPatientCount != null || (item.dailyExamTypes?.length ?? 0) > 0;
        if (!hasAny) return <span className="text-xs text-faint">—</span>;
        return (
          <div className="text-xs text-muted space-y-0.5">
            {item.dailyPatientCount != null && <div>Patients : {item.dailyPatientCount}</div>}
            {item.dailyElution != null && <div>Élution : {item.dailyElution} MBq</div>}
            {(item.dailyExamTypes?.length ?? 0) > 0 && <div>Examens : {item.dailyExamTypes!.join(', ')}</div>}
          </div>
        );
      },
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
            label={`Voir la fiche du déchet ${item.registryNumber ?? item.id}`}
            onClick={() => setDetailId(item.id)}
          >
            <Eye className="w-4 h-4" aria-hidden="true" />
          </IconButton>
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

          <p className="text-xs text-faint">
            Seuls le type de déchet et le radionucléide sont obligatoires. Les autres champs peuvent être complétés plus tard.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormSelect
              label="Service d'origine (optionnel)"
              name="originService"
              value={form.originService}
              onChange={handleSelectChange}
              options={originServiceOptions}
              error={fieldErrors.originService}
            />
            <FormSelect
              label="Opérateur responsable (optionnel)"
              name="responsibleOperator"
              value={form.responsibleOperator}
              onChange={handleSelectChange}
              options={operatorOptions}
              error={fieldErrors.responsibleOperator}
            />
            <FormSelect
              label="Type de déchet"
              name="type"
              value={form.type}
              onChange={handleSelectChange}
              options={typeOptions}
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
              label="Activité initiale (MBq) — optionnel"
              name="initialActivity"
              value={form.initialActivity}
              onChange={handleInputChange}
              type="number"
              step="any"
              min="0"
              error={fieldErrors.initialActivity}
            />
            <FormInput
              label="Masse brute (g) — optionnel"
              name="mass"
              value={form.mass}
              onChange={handleInputChange}
              type="number"
              step="any"
              min="0"
              error={fieldErrors.mass}
            />
            <div>
              <FormInput
                label="Tare du contenant (g) — optionnel"
                name="containerTare"
                value={form.containerTare}
                onChange={handleInputChange}
                type="number"
                step="0.1"
                min="0"
                error={fieldErrors.containerTare}
              />
              {netMassHint && <p className="text-xs text-accent mt-1">{netMassHint}</p>}
            </div>
            <FormInput
              label="Date et heure de mesure (optionnel)"
              name="measureDate"
              value={form.measureDate}
              onChange={handleInputChange}
              type="datetime-local"
              error={fieldErrors.measureDate}
            />
            <FormInput
              label="Date d'entrée en stockage"
              name="storageEntryDate"
              value={form.storageEntryDate}
              onChange={handleInputChange}
              type="datetime-local"
            />
            <FormInput
              label="Demi-vie physique (h) — optionnel"
              name="halfLife"
              value={form.halfLife}
              onChange={handleInputChange}
              type="number"
              step="any"
              min="0"
              error={fieldErrors.halfLife}
            />
            <FormInput
              label="Niveau de libération (Bq/g) — pré-rempli, modifiable"
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
              label="Seuil de débit de dose pour libération (µSv/h)"
              name="releaseDoseThreshold"
              value={form.releaseDoseThreshold}
              onChange={handleInputChange}
              type="number"
              step="0.01"
              min="0"
              error={fieldErrors.releaseDoseThreshold}
            />
            <FormInput
              label="Bruit de fond du local (µSv/h) — optionnel"
              name="backgroundDoseRate"
              value={form.backgroundDoseRate}
              onChange={handleInputChange}
              type="number"
              step="0.01"
              min="0"
              error={fieldErrors.backgroundDoseRate}
            />
            <FormInput
              label="Débit de dose au contact (µSv/h) — optionnel"
              name="doseRateContact"
              value={form.doseRateContact}
              onChange={handleInputChange}
              type="number"
              step="any"
              min="0"
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

          <fieldset className="space-y-4 rounded-xl border border-subtle p-4">
            <legend className="px-2 text-xs uppercase font-bold tracking-wide text-accent">
              Activité hospitalière du jour (optionnel)
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormInput
                label="Élution du jour (MBq)"
                name="dailyElution"
                value={form.dailyElution}
                onChange={handleInputChange}
                type="number"
                step="any"
                min="0"
                error={fieldErrors.dailyElution}
              />
              <FormInput
                label="Nombre de patients du jour"
                name="dailyPatientCount"
                value={form.dailyPatientCount}
                onChange={handleInputChange}
                type="number"
                step="1"
                min="0"
                error={fieldErrors.dailyPatientCount}
              />
            </div>
            <div>
              <p className="text-xs uppercase font-bold tracking-wide text-muted mb-2">
                Types d&apos;examens du jour (plusieurs choix possibles)
              </p>
              <div className="flex flex-wrap gap-2">
                {examTypeOptions.length === 0 ? (
                  <p className="text-xs text-faint">Aucun type d&apos;examen paramétré (voir Paramètres).</p>
                ) : (
                  examTypeOptions.map((exam) => {
                    const checked = form.dailyExamTypes.includes(exam);
                    return (
                      <label
                        key={exam}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer text-sm transition-colors ${
                          checked ? 'bg-accent/15 border-accent text-primary' : 'bg-surface-2 border-subtle text-muted hover:text-primary'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleExamType(exam)}
                          className="accent-yellow-400"
                        />
                        {exam}
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </fieldset>

          {!editId && (
            <fieldset className="space-y-3 rounded-xl border border-subtle p-4">
              <legend className="px-2 text-xs uppercase font-bold tracking-wide text-accent">Import historique (optionnel)</legend>
              <label className="flex items-start gap-2 text-sm text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.historicalEliminated}
                  onChange={(e) => setForm((prev) => ({ ...prev, historicalEliminated: e.target.checked }))}
                  className="mt-0.5 accent-yellow-400"
                />
                <span>Enregistrer ce déchet comme <strong>déjà éliminé</strong> (déchet ancien, sortie passée) — il n&apos;apparaîtra pas en stockage.</span>
              </label>
              {form.historicalEliminated && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormInput
                    label="Date d'élimination réelle"
                    name="histElimDate"
                    type="datetime-local"
                    value={form.histElimDate}
                    onChange={handleInputChange}
                  />
                  <FormSelect
                    label="Mode d'élimination"
                    name="histElimMode"
                    value={form.histElimMode}
                    onChange={handleSelectChange}
                    options={settings.eliminationModes}
                  />
                  <FormInput
                    label="Bruit de fond du local à la sortie (µSv/h)"
                    name="histExitBackground"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.histExitBackground}
                    onChange={handleInputChange}
                  />
                  <FormInput
                    label="Débit de dose de sortie AU CONTACT (µSv/h)"
                    name="histExitDose"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.histExitDose}
                    onChange={handleInputChange}
                  />
                  <FormInput
                    label="Débit de dose de sortie à 1 m (µSv/h)"
                    name="histExitDose1m"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.histExitDose1m}
                    onChange={handleInputChange}
                  />
                  <FormSelect
                    label="Contrôleur de sortie"
                    name="histController"
                    value={form.histController}
                    onChange={handleSelectChange}
                    options={operatorOptions}
                  />
                  <FormSelect
                    label="Conformité réglementaire"
                    name="histConformity"
                    value={form.histConformity}
                    onChange={handleSelectChange}
                    options={['Oui', 'Non']}
                  />
                </div>
              )}
            </fieldset>
          )}

          {editId && (editStatus === 'liberable' || editStatus === 'elimine') && (
            <fieldset className="space-y-3 rounded-xl border border-subtle p-4">
              <legend className="px-2 text-xs uppercase font-bold tracking-wide text-accent">Données de sortie / élimination</legend>
              <p className="text-xs text-faint">
                Ce déchet est déjà <strong>{editStatus === 'elimine' ? 'éliminé' : 'libérable'}</strong> : vous pouvez
                compléter ou corriger ses données de sortie (utile pour régulariser d&apos;anciens enregistrements).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormInput
                  label="Date de sortie / élimination"
                  name="histElimDate"
                  type="datetime-local"
                  value={form.histElimDate}
                  onChange={handleInputChange}
                />
                <FormSelect
                  label="Mode d'élimination"
                  name="histElimMode"
                  value={form.histElimMode}
                  onChange={handleSelectChange}
                  options={settings.eliminationModes}
                />
                <FormInput
                  label="Bruit de fond du local à la sortie (µSv/h)"
                  name="histExitBackground"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.histExitBackground}
                  onChange={handleInputChange}
                />
                <FormInput
                  label="Débit de dose de sortie AU CONTACT (µSv/h)"
                  name="histExitDose"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.histExitDose}
                  onChange={handleInputChange}
                />
                <FormInput
                  label="Débit de dose de sortie à 1 m (µSv/h)"
                  name="histExitDose1m"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.histExitDose1m}
                  onChange={handleInputChange}
                />
                <FormSelect
                  label="Contrôleur de sortie"
                  name="histController"
                  value={form.histController}
                  onChange={handleSelectChange}
                  options={operatorOptions}
                />
                <FormSelect
                  label="Conformité réglementaire"
                  name="histConformity"
                  value={form.histConformity}
                  onChange={handleSelectChange}
                  options={['Oui', 'Non']}
                />
              </div>
            </fieldset>
          )}

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
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-bold uppercase text-primary">Déchets</h3>
          <span className="text-xs text-muted">({visibleItems.length})</span>
          <div className="ml-auto flex items-center gap-2">
            <label htmlFor="status-filter" className="text-xs text-muted">Statut :</label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="px-3 py-1.5 bg-surface-2 border border-subtle rounded-lg text-primary text-sm"
            >
              <option value="tous">Tous</option>
              <option value="stockage">En stockage</option>
              <option value="liberable">Libérable</option>
              <option value="elimine">Éliminé</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-faint">
          Le bouton « Modifier » fonctionne sur <strong>tous</strong> les déchets, y compris ceux déjà libérés ou
          éliminés — pour compléter a posteriori les données manquantes (activité, masse, dates, sortie…).
        </p>

        <DataTable
          columns={columns}
          rows={visibleItems}
          getRowKey={(r) => r.id}
          searchPlaceholder="Rechercher (ID, type, isotope, opérateur)…"
          pageSize={10}
          emptyMessage="Aucun déchet à afficher."
          exportFileName="dechets"
        />
      </div>

      <Modal
        open={detailItem !== null}
        onClose={() => setDetailId(null)}
        title="Fiche détaillée du déchet"
        subtitle={detailItem?.registryNumber ?? detailItem?.id}
      >
        {detailItem && <WasteDetail item={detailItem} />}
      </Modal>
    </div>
  );
}

/** Ligne « libellé / valeur » d'une fiche détaillée. */
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 border-b border-subtle last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm text-primary text-right font-medium">{value}</span>
    </div>
  );
}

/** Fiche détaillée : caractérisation du déchet et indicateurs de conformité calculés. */
function WasteDetail({ item }: { item: WasteItem }) {
  const ev = evaluateConformity(item);
  const netExit = netExitDoseRate(item);
  // Une tare réelle existe-t-elle ? Sinon la « masse nette » renvoyée est en fait la masse brute.
  const hasTare = item.containerTare !== undefined && item.containerTare > 0;

  // Helpers d'affichage : valeur absente => tiret « — », jamais un zéro fabriqué.
  const num = (n: number | undefined, unit: string): string =>
    n !== undefined ? `${fmtNum(n, 2)} ${unit}` : '—';
  const dateFr = (iso: string | undefined): string =>
    iso ? new Date(iso).toLocaleString('fr-FR') : '—';

  const verdict = ev.conforme === true
    ? { label: 'CONFORME', cls: 'bg-green-500/20 text-green-600' }
    : ev.conforme === false
      ? { label: 'NON CONFORME', cls: 'bg-red-500/20 text-red-500' }
      : { label: 'INDÉTERMINÉ', cls: 'bg-slate-500/20 text-slate-500' };

  // Conformité DÉCLARÉE par le contrôleur, montrée à côté du verdict CALCULÉ pour rendre l'écart visible.
  const declared = item.exitConformity === undefined
    ? null
    : item.exitConformity
      ? { label: 'CONFORME', cls: 'bg-green-500/20 text-green-600' }
      : { label: 'NON CONFORME', cls: 'bg-red-500/20 text-red-500' };

  const hasExitData = item.eliminationDate !== undefined || item.exitControlDate !== undefined
    || item.eliminationMode !== undefined || item.exitBackgroundDoseRate !== undefined
    || item.exitDoseRate !== undefined || item.exitDoseRate1m !== undefined
    || item.exitController !== undefined || item.exitConformity !== undefined;

  return (
    <div className="space-y-5 max-h-[70vh] overflow-y-auto">
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-accent mb-2">Caractérisation</h4>
        <DetailRow label="Type de déchet" value={<span className="capitalize">{item.type}</span>} />
        <DetailRow label="Radionucléide" value={item.radionuclide} />
        <DetailRow label="Statut" value={<StatusBadge status={item.status} />} />
        <DetailRow label="Activité initiale" value={num(item.initialActivity, 'MBq')} />
        <DetailRow label="Date de mesure" value={dateFr(item.measureDate)} />
        <DetailRow label="Masse brute" value={num(item.mass, 'g')} />
        <DetailRow label="Tare du contenant" value={num(item.containerTare, 'g')} />
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-accent mb-2">Mesures à l&apos;entrée</h4>
        <DetailRow label="Bruit de fond du local (entrée)" value={num(item.backgroundDoseRate, 'µSv/h')} />
        <DetailRow label="Débit de dose au contact (entrée)" value={num(item.doseRateContact, 'µSv/h')} />
        <DetailRow label="Débit de dose à 1 m (entrée)" value={num(item.doseRate1m, 'µSv/h')} />
        <DetailRow label="Date d&apos;entrée en stockage" value={dateFr(item.storageEntryDate)} />
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-accent mb-2">Conformité (dictionnaire v2)</h4>
        <DetailRow
          label={hasTare ? 'Masse nette (brute − tare)' : 'Masse nette'}
          value={ev.netMassG !== null
            ? (hasTare
                ? `${fmtNum(ev.netMassG, 2)} g`
                : `${fmtNum(ev.netMassG, 2)} g (= masse brute, tare non renseignée)`)
            : '—'}
        />
        <DetailRow label="Activité massique" value={ev.massicBqPerG !== null ? `${fmtNum(ev.massicBqPerG, 2)} Bq/g` : '—'} />
        <DetailRow label="Niveau de libération applicable" value={ev.clearanceLevelBqPerG !== null ? `${fmtNum(ev.clearanceLevelBqPerG, 2)} Bq/g` : '—'} />
        <DetailRow
          label="Durée théorique de libération (t_lib)"
          value={ev.tLibHours !== null ? `${fmtNum(ev.tLibHours, 1)} h (${fmtNum(ev.tLibHours / 24, 2)} j)` : '—'}
        />
        <DetailRow label="Durée de stockage réelle" value={ev.storageHours !== null ? `${fmtNum(ev.storageHours, 1)} h` : '—'} />
        <DetailRow
          label="Indice de conformité (stockage / t_lib)"
          value={ev.conformityIndex !== null ? ev.conformityIndex.toFixed(2) : '—'}
        />
        {item.exitBackgroundDoseRate !== undefined && netExit !== null && (
          <DetailRow label="Débit de sortie net du bruit de fond" value={`${fmtNum(netExit, 2)} µSv/h`} />
        )}

        <div className="flex flex-wrap items-center gap-4 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted">Calculé</span>
            <span className={`px-3 py-1 text-[11px] font-black rounded-full ${verdict.cls}`}>{verdict.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted">Déclaré</span>
            {declared
              ? <span className={`px-3 py-1 text-[11px] font-black rounded-full ${declared.cls}`}>{declared.label}</span>
              : <span className="text-xs text-faint">—</span>}
          </div>
        </div>
        <p className="text-xs text-muted mt-1">
          Le verdict « Calculé » est établi automatiquement (règle ET), jamais saisi ; « Déclaré » est la conformité renseignée par le contrôleur.
        </p>

        {ev.conforme === null && ev.missing.length > 0 && (
          <p className="text-xs text-faint mt-2">
            Données manquantes : {ev.missing.join(', ')}.
          </p>
        )}
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-accent mb-2">Sortie / élimination</h4>
        {hasExitData ? (
          <>
            <DetailRow label="Date de sortie / élimination" value={dateFr(item.eliminationDate ?? item.exitControlDate)} />
            <DetailRow label="Mode d&apos;élimination" value={item.eliminationMode ?? '—'} />
            <DetailRow label="Bruit de fond du local (sortie)" value={num(item.exitBackgroundDoseRate, 'µSv/h')} />
            <DetailRow label="Débit de dose de sortie au contact (brut)" value={num(item.exitDoseRate, 'µSv/h')} />
            <DetailRow label="Débit de dose de sortie à 1 m" value={num(item.exitDoseRate1m, 'µSv/h')} />
            <DetailRow label="Contrôleur de sortie" value={item.exitController ?? '—'} />
          </>
        ) : (
          <p className="text-xs text-faint">Aucune donnée de sortie enregistrée.</p>
        )}
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
