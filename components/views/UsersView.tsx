'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Edit2, UserPlus, X } from 'lucide-react';
import type { User, UserRole, Permission } from '@/types';
import {
  createUserAccount,
  updateUserProfile,
  deleteUserProfile,
  defaultPermissionsForRole,
} from '@/lib/repositories/userRepository';
import { writeLog } from '@/lib/repositories/logRepository';
import { useToast } from '@/components/ui/Toast';
import { FormInput, FormSelect } from '@/components/ui/Form';
import { IconButton, SectionHeader } from '@/components/ui/Primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';

interface UsersViewProps {
  users: User[];
  profile: User;
}

const ROLE_OPTIONS: UserRole[] = [
  'Administrateur',
  'Médecin nucléaire',
  'Radiopharmacien',
  'Manipulateur',
  'Physicien médical',
  'Conseiller en radioprotection',
];

const PERMISSION_LABELS: Record<Permission, string> = {
  admin_complet: 'Administration complète',
  gestion_totale: 'Gestion totale',
  ajout_dechet: 'Ajout de déchet',
  lecture: 'Lecture',
};

/** Couleur du badge de rôle (couleurs d'état autorisées hors thème sémantique). */
function roleBadgeClass(role: UserRole): string {
  switch (role) {
    case 'Administrateur':
      return 'bg-red-500/20 text-red-500';
    case 'Médecin nucléaire':
      return 'bg-blue-500/20 text-blue-500';
    case 'Radiopharmacien':
      return 'bg-green-500/20 text-green-600';
    case 'Physicien médical':
      return 'bg-yellow-500/20 text-yellow-600';
    case 'Conseiller en radioprotection':
      return 'bg-purple-500/20 text-purple-500';
    default:
      return 'bg-slate-500/20 text-slate-500';
  }
}

/** Formate un horodatage ISO en date-heure locale fr-FR, ou 'Jamais' si absent/invalide. */
function formatLastLogin(iso: string | undefined): string {
  if (!iso) return 'Jamais';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Jamais';
  return d.toLocaleString('fr-FR');
}

/** Clé de tri pour la dernière connexion : timestamp (0 si jamais connecté). */
function lastLoginSortValue(iso: string | undefined): number {
  if (!iso) return 0;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export function UsersView({ users, profile }: UsersViewProps) {
  const { success, error } = useToast();

  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [role, setRole] = useState<UserRole | ''>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isCreating = isAdding && editId === null;

  const resetForm = (): void => {
    setName('');
    setEmail('');
    setPassword('');
    setRole('');
    setIsAdding(false);
    setEditId(null);
  };

  const handleToggleAdd = (): void => {
    if (isAdding) {
      resetForm();
      return;
    }
    setEditId(null);
    setName('');
    setEmail('');
    setPassword('');
    setRole('');
    setIsAdding(true);
  };

  const handleStartEdit = (u: User): void => {
    setEditId(u.id);
    setName(u.name);
    setEmail(u.email ?? '');
    setPassword('');
    setRole(u.role);
    setIsAdding(true);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>): void => setName(e.target.value);
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>): void => setEmail(e.target.value);
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>): void => setPassword(e.target.value);
  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>): void => setRole(e.target.value as UserRole | '');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      error('Le nom est obligatoire.');
      return;
    }
    if (!trimmedEmail) {
      error("L'adresse e-mail est obligatoire.");
      return;
    }
    if (!role) {
      error('Le rôle est obligatoire.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editId === null) {
        if (password.length < 6) {
          error('Le mot de passe doit comporter au moins 6 caractères.');
          setIsSubmitting(false);
          return;
        }
        await createUserAccount({
          name: trimmedName,
          email: trimmedEmail,
          password,
          role,
          hospitalId: profile.hospitalId,
        });
        success(`Compte « ${trimmedName} » créé.`);
        await writeLog(profile.hospitalId, `Création du compte utilisateur « ${trimmedName} » (${role})`);
      } else {
        const normalizedEmail = trimmedEmail.toLowerCase();
        await updateUserProfile(editId, {
          name: trimmedName,
          role,
          email: normalizedEmail,
          permissions: defaultPermissionsForRole(role),
        });
        success(`Compte « ${trimmedName} » mis à jour.`);
        await writeLog(profile.hospitalId, `Modification du compte utilisateur « ${trimmedName} » (${role})`);
      }
      resetForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue.';
      error(
        editId === null
          ? `Échec de la création du compte : ${message}`
          : `Échec de la mise à jour du compte : ${message}`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (u: User): Promise<void> => {
    if (deletingId) return;
    if (u.id === profile.id) return;
    const confirmed = window.confirm(
      `Supprimer le compte « ${u.name} » ? Cette action est irréversible.`,
    );
    if (!confirmed) return;

    setDeletingId(u.id);
    try {
      await deleteUserProfile(u.id);
      success(`Compte « ${u.name} » supprimé.`);
      await writeLog(profile.hospitalId, `Suppression du compte utilisateur « ${u.name} »`);
      if (editId === u.id) resetForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue.';
      error(`Échec de la suppression du compte : ${message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const columns = useMemo<Column<User>[]>(() => [
    {
      key: 'name',
      header: 'Nom & contact',
      render: (u) => (
        <div>
          <div className="font-semibold text-primary">{u.name}</div>
          <div className="text-xs text-muted">{u.email ?? '—'}</div>
          <div className="text-xs text-faint">{u.id}</div>
        </div>
      ),
      sortValue: (u) => u.name.toLowerCase(),
      searchValue: (u) => `${u.name} ${u.email ?? ''}`,
      csvValue: (u) => `${u.name} — ${u.email ?? ''}`,
    },
    {
      key: 'role',
      header: 'Rôle',
      render: (u) => (
        <span
          className={`inline-block px-3 py-1 text-xs font-black uppercase rounded-full ${roleBadgeClass(u.role)}`}
        >
          {u.role}
        </span>
      ),
      sortValue: (u) => u.role,
      searchValue: (u) => u.role,
    },
    {
      key: 'permissions',
      header: 'Droits',
      render: (u) => {
        const permissions = u.permissions ?? [];
        if (permissions.length === 0) {
          return <span className="text-xs text-faint">Aucun droit</span>;
        }
        return (
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted">
            {permissions.map((p) => (
              <li key={p}>{PERMISSION_LABELS[p] ?? p}</li>
            ))}
          </ul>
        );
      },
      csvValue: (u) =>
        (u.permissions ?? []).map((p) => PERMISSION_LABELS[p] ?? p).join(', ') || 'Aucun droit',
    },
    {
      key: 'lastLogin',
      header: 'Dernière connexion',
      render: (u) => <span className="text-xs text-muted">{formatLastLogin(u.lastLogin)}</span>,
      sortValue: (u) => lastLoginSortValue(u.lastLogin),
      csvValue: (u) => formatLastLogin(u.lastLogin),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (u) => {
        const isSelf = u.id === profile.id;
        return (
          <div className="flex justify-end gap-2">
            <IconButton
              onClick={() => handleStartEdit(u)}
              label={`Modifier le compte ${u.name}`}
              variant="info"
            >
              <Edit2 className="h-4 w-4" aria-hidden="true" />
            </IconButton>
            {!isSelf && (
              <IconButton
                onClick={() => {
                  void handleDelete(u);
                }}
                label={`Supprimer le compte ${u.name}`}
                variant="danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            )}
          </div>
        );
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [profile.id, deletingId, editId]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Gestion des comptes"
        description="Création, modification et suppression des utilisateurs de l'établissement."
        action={
          <button
            type="button"
            onClick={handleToggleAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-sm font-bold text-primary transition-colors hover:opacity-90"
          >
            {isAdding ? (
              <>
                <X className="h-4 w-4" aria-hidden="true" />
                Annuler
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nouveau compte
              </>
            )}
          </button>
        }
      />

      {isAdding && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 bg-surface border border-subtle rounded-2xl p-6"
        >
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-primary">
            <UserPlus className="h-4 w-4 text-accent" aria-hidden="true" />
            {isCreating ? 'Créer un compte' : 'Modifier le compte'}
          </h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormInput
              label="Nom"
              name="name"
              value={name}
              onChange={handleNameChange}
              required
              placeholder="Nom complet"
            />
            <FormInput
              label="E-mail"
              name="email"
              type="email"
              value={email}
              onChange={handleEmailChange}
              required
              placeholder="nom@etablissement.fr"
            />
            {isCreating && (
              <FormInput
                label="Mot de passe"
                name="password"
                type="password"
                value={password}
                onChange={handlePasswordChange}
                required
                placeholder="Minimum 6 caractères"
              />
            )}
            <FormSelect
              label="Rôle"
              name="role"
              value={role}
              onChange={handleRoleChange}
              options={ROLE_OPTIONS}
              required
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-surface-2 border border-subtle text-sm font-bold text-muted transition-colors hover:text-primary disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-accent text-sm font-bold text-primary transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting
                ? 'Enregistrement…'
                : isCreating
                  ? 'Créer le compte'
                  : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}

      <DataTable
        columns={columns}
        rows={users}
        getRowKey={(u) => u.id}
        searchPlaceholder="Rechercher (nom, email, rôle)…"
        pageSize={10}
        emptyMessage="Aucun utilisateur enregistré."
        exportFileName="utilisateurs"
      />
    </div>
  );
}
