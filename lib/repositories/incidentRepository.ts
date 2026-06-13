import {
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Incident } from '@/types';
import { makeRegistryNumber } from './ids';
import { stripUndefined } from './sanitize';

const COL = 'incidents';

export function subscribeIncidents(
  hospitalId: string,
  onData: (items: Incident[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COL), where('hospitalId', '==', hospitalId));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ ...(d.data() as Incident), id: d.id }))),
    onError,
  );
}

export async function createIncident(input: Omit<Incident, 'id' | 'registryNumber'>): Promise<string> {
  const ref = doc(collection(db, COL));
  const incident: Incident = { ...input, id: ref.id, registryNumber: makeRegistryNumber('INC', String(new Date().getFullYear())) };
  await setDoc(ref, stripUndefined(incident));
  return ref.id;
}

export async function updateIncident(id: string, patch: Partial<Incident>): Promise<void> {
  await updateDoc(doc(db, COL, id), stripUndefined(patch));
}

export async function deleteIncident(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
