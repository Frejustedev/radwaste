import {
  collection, doc, setDoc, updateDoc, onSnapshot, query, where, getDocs, writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { WasteItem } from '@/types';
import { makeRegistryNumber } from './ids';
import { stripUndefined } from './sanitize';

const COL = 'wasteItems';

export function subscribeWasteItems(
  hospitalId: string,
  onData: (items: WasteItem[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COL), where('hospitalId', '==', hospitalId));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ ...(d.data() as WasteItem), id: d.id }))),
    onError,
  );
}

/** Crée un déchet avec un identifiant technique garanti unique (élimine tout écrasement). */
export async function createWasteItem(input: Omit<WasteItem, 'id' | 'registryNumber'>): Promise<string> {
  const ref = doc(collection(db, COL));
  const isotope = input.radionuclide ? input.radionuclide.replace('-', '').toUpperCase() : 'UNK';
  const item: WasteItem = { ...input, id: ref.id, registryNumber: makeRegistryNumber('WST', isotope) };
  await setDoc(ref, stripUndefined(item));
  return ref.id;
}

export async function updateWasteItem(id: string, patch: Partial<WasteItem>): Promise<void> {
  await updateDoc(doc(db, COL, id), stripUndefined(patch));
}

/** Supprime un déchet et, atomiquement, les incidents qui lui sont rattachés. */
export async function deleteWasteItem(id: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, COL, id));
  const linked = await getDocs(query(collection(db, 'incidents'), where('wasteId', '==', id)));
  linked.forEach((d) => batch.delete(doc(db, 'incidents', d.id)));
  await batch.commit();
}

const BATCH_LIMIT = 450; // marge sous la limite Firestore de 500 opérations par lot

/** Passe une liste de déchets au statut « libérable », par lots (gère >500 documents). */
export async function releaseWasteItems(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    ids.slice(i, i + BATCH_LIMIT).forEach((id) => batch.update(doc(db, COL, id), { status: 'liberable' }));
    await batch.commit();
  }
}

/**
 * Corrige en masse la date d'entrée en stockage (régularisation d'anciens enregistrements dont
 * l'entrée avait été auto-remplie à la date de saisie).
 */
export async function bulkSetEntryDates(updates: { id: string; storageEntryDate: string }[]): Promise<void> {
  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    updates.slice(i, i + BATCH_LIMIT).forEach((u) => {
      batch.update(doc(db, COL, u.id), { storageEntryDate: u.storageEntryDate });
    });
    await batch.commit();
  }
}

/** Passe une liste de déchets au statut « éliminé » avec des champs de sortie communs, par lots. */
export async function bulkEliminate(ids: string[], fields: Partial<WasteItem>): Promise<void> {
  const patch = stripUndefined({ ...fields, status: 'elimine' as const });
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    ids.slice(i, i + BATCH_LIMIT).forEach((id) => batch.update(doc(db, COL, id), patch));
    await batch.commit();
  }
}
