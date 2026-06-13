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

/** Passe une liste de déchets au statut « libérable » de façon atomique. */
export async function releaseWasteItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  ids.forEach((id) => batch.update(doc(db, COL, id), { status: 'liberable' }));
  await batch.commit();
}
