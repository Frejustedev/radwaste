'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import type { Unsubscribe } from 'firebase/firestore';
import { auth } from '@/lib/firebase';
import type { WasteItem, Incident, User, ActionLog, AppSettings } from '@/types';
import { getUserProfile, updateUserProfile, subscribeUsers } from '@/lib/repositories/userRepository';
import { subscribeWasteItems } from '@/lib/repositories/wasteRepository';
import { subscribeIncidents } from '@/lib/repositories/incidentRepository';
import { subscribeLogs } from '@/lib/repositories/logRepository';
import { subscribeSettings } from '@/lib/repositories/settingsRepository';
import { withDefaults } from '@/lib/settings/defaults';

export interface RadwasteData {
  authUser: FirebaseUser | null;
  profile: User | null;
  authLoading: boolean;
  profileLoading: boolean;
  wasteItems: WasteItem[];
  incidents: Incident[];
  users: User[];
  actionLogs: ActionLog[];
  settings: AppSettings;
}

export function useRadwasteData(onSubscriptionError?: (msg: string) => void): RadwasteData {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const [wasteItems, setWasteItems] = useState<WasteItem[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [rawSettings, setRawSettings] = useState<Partial<AppSettings> | null>(null);

  // Authentification + chargement du profil
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setAuthUser(u);
      setAuthLoading(false);
      if (u) {
        setProfileLoading(true);
        try {
          const p = await getUserProfile(u.uid);
          setProfile(p);
          if (p) {
            updateUserProfile(u.uid, { lastLogin: new Date().toISOString() }).catch(() => {});
          }
        } catch {
          setProfile(null);
        } finally {
          setProfileLoading(false);
        }
      } else {
        setProfile(null);
        setWasteItems([]);
        setIncidents([]);
        setUsers([]);
        setActionLogs([]);
      }
    });
    return () => unsub();
  }, []);

  // Abonnements temps réel, cloisonnés par hospitalId. Nettoyage déterministe (corrige les fuites).
  const hospitalId = profile?.hospitalId;
  useEffect(() => {
    if (!hospitalId) return;
    const onErr = (label: string) => (err: Error) => {
      console.error(`${label} snapshot error:`, err);
      onSubscriptionError?.(`Erreur de synchronisation (${label}).`);
    };
    const subs: Unsubscribe[] = [
      subscribeWasteItems(hospitalId, setWasteItems, onErr('déchets')),
      subscribeIncidents(hospitalId, setIncidents, onErr('incidents')),
      subscribeUsers(hospitalId, setUsers, onErr('utilisateurs')),
      subscribeLogs(hospitalId, setActionLogs, onErr('journal')),
      subscribeSettings(hospitalId, setRawSettings, onErr('paramètres')),
    ];
    return () => subs.forEach((u) => u());
  }, [hospitalId, onSubscriptionError]);

  const settings = withDefaults(hospitalId ?? '', rawSettings);

  return { authUser, profile, authLoading, profileLoading, wasteItems, incidents, users, actionLogs, settings };
}
