import { doc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { WasteItem, Incident, User, ActionLog } from '@/types';
import type { ParsedBackup } from '@/lib/validation/schemas';

export interface BackupContent {
  wasteItems: WasteItem[];
  incidents: Incident[];
  users: User[];
  actionLogs: ActionLog[];
  exportedAt: string;
}

export function buildBackup(data: Omit<BackupContent, 'exportedAt'>): BackupContent {
  return { ...data, exportedAt: new Date().toISOString() };
}

/**
 * Restaure une sauvegarde déjà validée, de façon atomique (writeBatch).
 * - `hospitalId` est imposé sur chaque enregistrement (anti-injection inter-établissement).
 * - Le journal d'audit (logs) n'est PAS restauré : il est append-only et horodaté serveur,
 *   réinjecter d'anciennes entrées violerait les règles Firestore.
 */
export async function restoreBackup(parsed: ParsedBackup, hospitalId: string): Promise<void> {
  const batch = writeBatch(db);

  parsed.wasteItems.forEach((w) => {
    batch.set(doc(db, 'wasteItems', w.id), { ...w, hospitalId });
  });
  parsed.incidents.forEach((i) => {
    batch.set(doc(db, 'incidents', i.id), { ...i, hospitalId });
  });
  parsed.users.forEach((u) => {
    batch.set(doc(db, 'users', u.id), { ...u, hospitalId });
  });

  await batch.commit();
}
