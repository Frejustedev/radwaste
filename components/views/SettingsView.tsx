'use client';

import React, { useRef, useState } from 'react';
import { Download, Upload, ScrollText, Palette } from 'lucide-react';
import type { WasteItem, Incident, User, ActionLog } from '@/types';
import { validateBackup, type ParsedBackup } from '@/lib/validation/schemas';
import { buildBackup, restoreBackup } from '@/lib/repositories/backupRepository';
import { writeLog } from '@/lib/repositories/logRepository';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { FormInput } from '@/components/ui/Form';
import { EmptyState, SectionHeader } from '@/components/ui/Primitives';

interface SettingsViewProps {
  wasteItems: WasteItem[];
  incidents: Incident[];
  users: User[];
  actionLogs: ActionLog[];
  profile: User;
}

/** Date du jour au format AAAA-MM-JJ (fuseau local), pour nommer le fichier de sauvegarde. */
function todayStamp(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Formate un horodatage ISO en date-heure locale française, ou un tiret si absent/invalide. */
function formatLogDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR');
}

const CONFIRM_PHRASE = 'CONFIRMER';

export function SettingsView({ wasteItems, incidents, users, actionLogs, profile }: SettingsViewProps) {
  const { success, error } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Sauvegarde validée en attente de confirmation (null = modale fermée).
  const [pendingRestore, setPendingRestore] = useState<ParsedBackup | null>(null);
  const [confirmText, setConfirmText] = useState('');

  async function handleCreateBackup() {
    if (isBackingUp) return;
    setIsBackingUp(true);
    try {
      const data = buildBackup({ wasteItems, incidents, users, actionLogs });
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup_radwaste_${todayStamp()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      success('Sauvegarde créée et téléchargement lancé.');
      await writeLog(profile.hospitalId, 'Sauvegarde des données exportée (fichier JSON téléchargé).');
    } catch {
      error('Échec de la création de la sauvegarde.');
    } finally {
      setIsBackingUp(false);
    }
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Réinitialise l'input pour permettre de re-sélectionner le même fichier ultérieurement.
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onerror = () => error('Fichier illisible');
    reader.onload = () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch {
        error('Fichier illisible');
        return;
      }

      const res = validateBackup(parsed);
      if (!res.ok || !res.value) {
        error('Sauvegarde invalide: ' + (res.errors[0]?.message ?? 'fichier non conforme.'));
        return;
      }

      // Sauvegarde valide : on ouvre la modale de confirmation explicite.
      setPendingRestore(res.value);
      setConfirmText('');
    };
    reader.readAsText(file);
  }

  function closeRestoreModal() {
    if (isRestoring) return;
    setPendingRestore(null);
    setConfirmText('');
  }

  async function handleConfirmRestore() {
    if (!pendingRestore || isRestoring) return;
    if (confirmText.trim() !== CONFIRM_PHRASE) {
      error('Veuillez taper « CONFIRMER » pour autoriser la restauration.');
      return;
    }

    setIsRestoring(true);
    try {
      await restoreBackup(pendingRestore, profile.hospitalId);
      success('Restauration effectuée.');
      await writeLog(profile.hospitalId, 'Restauration d’une sauvegarde (écrasement des enregistrements de même identifiant).');
      setPendingRestore(null);
      setConfirmText('');
    } catch {
      error('Échec de la restauration de la sauvegarde.');
    } finally {
      setIsRestoring(false);
    }
  }

  const confirmReady = confirmText.trim() === CONFIRM_PHRASE;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Paramètres"
        description="Sauvegarde, restauration et journal d'audit. Réservé à l'administration."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sauvegarde & Export */}
        <div className="bg-surface border border-subtle rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-accent" aria-hidden="true"><Download className="w-5 h-5" /></span>
            <h4 className="font-black italic uppercase text-primary text-sm">Sauvegarde &amp; Export</h4>
          </div>
          <p className="text-xs text-muted">
            Exporte l'intégralité des enregistrements (déchets, incidents, utilisateurs, journal) dans un
            fichier JSON horodaté, à conserver hors ligne.
          </p>
          <button
            type="button"
            onClick={handleCreateBackup}
            disabled={isBackingUp}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-accent text-black hover:opacity-90 disabled:opacity-50"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            {isBackingUp ? 'Création…' : 'Créer une sauvegarde'}
          </button>
        </div>

        {/* Restauration */}
        <div className="bg-surface border border-subtle rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-accent" aria-hidden="true"><Upload className="w-5 h-5" /></span>
            <h4 className="font-black italic uppercase text-primary text-sm">Restauration</h4>
          </div>
          <p className="text-xs text-muted">
            Importe un fichier de sauvegarde JSON. L'opération écrase les enregistrements de même
            identifiant. Le journal d'audit n'est pas restauré.
          </p>
          <div>
            <label htmlFor="restore-file" className="block text-[11px] uppercase font-bold tracking-widest text-muted mb-1">
              Fichier de sauvegarde (.json)
            </label>
            <input
              id="restore-file"
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileSelected}
              disabled={isRestoring}
              className="block w-full text-sm text-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-surface-2 file:text-primary hover:file:opacity-90 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Journal d'actions (Logs) */}
        <div className="bg-surface border border-subtle rounded-2xl p-6 space-y-4 lg:col-span-2">
          <div className="flex items-center gap-3">
            <span className="text-accent" aria-hidden="true"><ScrollText className="w-5 h-5" /></span>
            <h4 className="font-black italic uppercase text-primary text-sm">Journal d'actions (Logs)</h4>
          </div>
          {actionLogs.length === 0 ? (
            <EmptyState message="Aucun log" />
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-subtle bg-surface-2">
              <ul className="divide-y divide-subtle">
                {actionLogs.map((log) => (
                  <li key={log.id} className="px-4 py-2 font-mono text-xs text-primary flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
                    <span className="text-faint shrink-0">{formatLogDate(log.date)}</span>
                    <span className="text-accent shrink-0">{log.userEmail}</span>
                    <span className="text-muted break-words">{log.action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Thème (note, pas de sélecteur inerte) */}
        <div className="bg-surface border border-subtle rounded-2xl p-6 space-y-4 lg:col-span-2">
          <div className="flex items-center gap-3">
            <span className="text-accent" aria-hidden="true"><Palette className="w-5 h-5" /></span>
            <h4 className="font-black italic uppercase text-primary text-sm">Apparence</h4>
          </div>
          <p className="text-xs text-muted">
            Le thème (clair/sombre) se règle depuis l'icône en haut à droite.
          </p>
        </div>
      </div>

      {pendingRestore && (
        <Modal
          open
          onClose={closeRestoreModal}
          title="Confirmer la restauration"
          subtitle="Action irréversible"
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 space-y-2">
              <p className="text-sm font-bold text-red-500">Attention :</p>
              <ul className="list-disc list-inside text-xs text-red-500 space-y-1">
                <li>Cette opération écrase les enregistrements de même identifiant.</li>
                <li>Le journal d'audit n'est PAS restauré (il est append-only et horodaté côté serveur).</li>
              </ul>
            </div>

            <p className="text-xs text-muted">
              Fichier validé : {pendingRestore.wasteItems.length} déchet(s), {pendingRestore.incidents.length} incident(s),{' '}
              {pendingRestore.users.length} utilisateur(s).
            </p>

            <FormInput
              label={`Tapez « ${CONFIRM_PHRASE} » pour activer la restauration`}
              name="confirmText"
              value={confirmText}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              required
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeRestoreModal}
                disabled={isRestoring}
                className="px-4 py-2 rounded-lg text-sm font-bold text-muted hover:text-primary border border-subtle disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={!confirmReady || isRestoring}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-red-500 text-white hover:opacity-90 disabled:opacity-50"
              >
                {isRestoring ? 'Restauration…' : 'Restaurer'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
