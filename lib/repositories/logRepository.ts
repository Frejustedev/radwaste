import {
  collection, addDoc, onSnapshot, query, where, serverTimestamp, Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type { ActionLog } from '@/types';

const COL = 'logs';

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return new Date(0).toISOString();
}

export function subscribeLogs(
  hospitalId: string,
  onData: (items: ActionLog[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COL), where('hospitalId', '==', hospitalId));
  return onSnapshot(
    q,
    (snap) => {
      const logs = snap.docs.map((d) => {
        const data = d.data();
        return { ...(data as ActionLog), id: d.id, date: toIso(data.date) };
      });
      logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      onData(logs);
    },
    onError,
  );
}

/**
 * Écrit une entrée de journal inviolable : horodatage serveur imposé (serverTimestamp),
 * e-mail dérivé du jeton d'authentification (vérifié côté règles). Append-only.
 */
export async function writeLog(hospitalId: string, action: string): Promise<void> {
  const userEmail = auth.currentUser?.email;
  if (!userEmail || !hospitalId) return;
  try {
    await addDoc(collection(db, COL), {
      hospitalId,
      userEmail,
      action,
      date: serverTimestamp(),
    });
  } catch (err) {
    console.error("Échec d'écriture du journal d'audit", err);
  }
}
