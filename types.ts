export type WasteType = 'solide' | 'liquide' | 'biologique' | 'seringue' | 'flacon' | 'tubulure' | 'gants' | 'compresses' | 'autres';
export type Radionuclide = 'Tc-99m' | 'I-131' | 'Lu-177' | 'Ga-68' | 'F-18' | 'Y-90' | 'autres';
export type WasteStatus = 'stockage' | 'liberable' | 'elimine' | 'incident';

export interface WasteItem {
  id: string; // Identifiant unique du document (clé technique, sans collision)
  registryNumber?: string; // Numéro de registre lisible (affichage)
  createdAt: string; // Date de création (ISO)
  originService: string; // Service d'origine
  responsibleOperator: string; // Opérateur responsable
  type: WasteType;
  hospitalId: string;

  // Radioactivité
  radionuclide: Radionuclide;
  initialActivity: number; // activité initiale en MBq
  mass: number; // masse du colis en grammes (nécessaire au calcul de l'activité massique)
  measureDate: string; // Date et heure de mesure (ISO)
  doseRateContact: number; // Débit de dose au contact (µSv/h)
  doseRate1m: number; // Débit de dose à 1 mètre (µSv/h)
  halfLife: number; // demi-vie physique en heures
  // Niveau de libération en activité massique (Bq/g). Si absent, dérivé de la table du radionucléide.
  clearanceLevelBqPerG?: number;
  // @deprecated — ancien seuil en MBq, conservé pour compatibilité ascendante uniquement.
  regulatoryClearanceLevel?: number;

  // Stockage
  storageEntryDate: string;
  storageResponsible: string;
  expectedDecayDuration: number; // en jours

  // Sortie et Élimination (si éliminé)
  exitControlDate?: string;
  exitDoseRate?: number;
  exitConformity?: boolean;
  exitController?: string;
  exitSignedBy?: string; // e-mail du compte authentifié ayant validé (signature électronique)
  eliminationDate?: string;
  eliminationMode?: string;
  eliminationResponsible?: string;

  status: WasteStatus;
}

export type IncidentType = 'Déversement accidentel' | 'Contamination' | 'Perte de déchet';

export interface Incident {
  id: string;
  registryNumber?: string;
  date: string;
  personnelFunction: string;
  type: IncidentType;
  doseRateBefore: number;
  correctiveActions: string;
  doseRateAfter: number;
  wasteId?: string;
  hospitalId: string;
}

export type UserRole = 'Administrateur' | 'Médecin nucléaire' | 'Radiopharmacien' | 'Manipulateur' | 'Physicien médical' | 'Conseiller en radioprotection';

export type Permission = 'admin_complet' | 'gestion_totale' | 'ajout_dechet' | 'lecture';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email?: string;
  permissions?: Permission[];
  lastLogin?: string;
  hospitalId: string;
}

export interface ActionLog {
  id: string;
  date: string; // horodatage serveur (ISO côté client, Timestamp côté Firestore)
  userEmail: string;
  action: string;
  hospitalId: string;
}
