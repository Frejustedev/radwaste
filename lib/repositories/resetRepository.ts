import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const BATCH_LIMIT = 450; // marge sous la limite Firestore de 500 opérations par lot

/** Supprime tous les documents d'une collection pour un hôpital donné, par lots. */
async function deleteAllInCollection(col: string, hospitalId: string): Promise<number> {
  const snap = await getDocs(query(collection(db, col), where('hospitalId', '==', hospitalId)));
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(doc(db, col, d.id)));
    await batch.commit();
  }
  return docs.length;
}

/**
 * Réinitialise les données opérationnelles de l'établissement : supprime tous les déchets et
 * incidents. Conserve les comptes utilisateurs, les paramètres et le journal d'audit (append-only).
 * Réservé aux administrateurs (règles Firestore).
 */
export async function resetOperationalData(hospitalId: string): Promise<{ wasteItems: number; incidents: number }> {
  const wasteItems = await deleteAllInCollection('wasteItems', hospitalId);
  const incidents = await deleteAllInCollection('incidents', hospitalId);
  return { wasteItems, incidents };
}
