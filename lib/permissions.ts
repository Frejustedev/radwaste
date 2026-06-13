import type { User } from '@/types';

export function isAdmin(profile: User | null | undefined): boolean {
  return profile?.role === 'Administrateur';
}

/** Toute personne disposant d'un profil autorisé peut consulter et gérer les déchets/incidents. */
export function canManageWaste(profile: User | null | undefined): boolean {
  return !!profile;
}

export function canManageUsers(profile: User | null | undefined): boolean {
  return isAdmin(profile);
}

export function canManageSettings(profile: User | null | undefined): boolean {
  return isAdmin(profile);
}
