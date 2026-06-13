import {
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where,
  type Unsubscribe,
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, secondaryAuth } from '@/lib/firebase';
import type { User, UserRole, Permission } from '@/types';

const COL = 'users';

export function defaultPermissionsForRole(role: UserRole): Permission[] {
  switch (role) {
    case 'Administrateur':
      return ['admin_complet'];
    case 'Radiopharmacien':
      return ['lecture', 'gestion_totale'];
    case 'Manipulateur':
    case 'Médecin nucléaire':
      return ['lecture', 'ajout_dechet'];
    default:
      return ['lecture'];
  }
}

export function subscribeUsers(
  hospitalId: string,
  onData: (items: User[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COL), where('hospitalId', '==', hospitalId));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ ...(d.data() as User), id: d.id }))),
    onError,
  );
}

export async function getUserProfile(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db, COL, uid));
  return snap.exists() ? ({ ...(snap.data() as User), id: snap.id }) : null;
}

/**
 * Crée un compte (Auth + profil Firestore) via l'instance d'authentification secondaire,
 * afin de préserver la session de l'administrateur courant. L'écriture du profil exige le
 * rôle Administrateur côté règles Firestore.
 *
 * NB : la voie recommandée pour la production est la Cloud Function `createUser` (functions/),
 * qui pose le rôle en custom claim et évite toute création de compte côté client.
 */
export async function createUserAccount(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  hospitalId: string;
}): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const credential = await createUserWithEmailAndPassword(secondaryAuth, email, input.password);
  const uid = credential.user.uid;
  const profile: User = {
    id: uid,
    hospitalId: input.hospitalId,
    name: input.name,
    role: input.role,
    email,
    permissions: defaultPermissionsForRole(input.role),
    lastLogin: new Date().toISOString(),
  };
  await setDoc(doc(db, COL, uid), profile);
  await signOut(secondaryAuth);
  return uid;
}

export async function updateUserProfile(uid: string, patch: Partial<User>): Promise<void> {
  await updateDoc(doc(db, COL, uid), patch);
}

export async function setUserProfile(uid: string, profile: User): Promise<void> {
  await setDoc(doc(db, COL, uid), profile);
}

export async function deleteUserProfile(uid: string): Promise<void> {
  await deleteDoc(doc(db, COL, uid));
}
