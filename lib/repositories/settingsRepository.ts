import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AppSettings } from '@/types';

const COL = 'appSettings';

/** S'abonne au document de paramètres de l'établissement (id = hospitalId). */
export function subscribeSettings(
  hospitalId: string,
  onData: (settings: Partial<AppSettings> | null) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, COL, hospitalId),
    (snap) => onData(snap.exists() ? (snap.data() as Partial<AppSettings>) : null),
    onError,
  );
}

/** Enregistre (fusion) les listes paramétrables. Réservé aux administrateurs (règles Firestore). */
export async function saveSettings(hospitalId: string, settings: Partial<AppSettings>): Promise<void> {
  await setDoc(doc(db, COL, hospitalId), { ...settings, hospitalId }, { merge: true });
}
