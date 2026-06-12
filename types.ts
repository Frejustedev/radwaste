export type WasteType = 'solide' | 'liquide' | 'biologique' | 'seringue' | 'flacon' | 'tubulure' | 'gants' | 'compresses' | 'autres';
export type Radionuclide = 'Tc-99m' | 'I-131' | 'Lu-177' | 'Ga-68' | 'F-18' | 'Y-90' | 'autres';
export type WasteStatus = 'stockage' | 'liberable' | 'elimine' | 'incident';

export interface WasteItem {
  id: string; // Numéro unique
  createdAt: string; // Date de création
  originService: string; // Service d'origine
  responsibleOperator: string; // Opérateur responsable
  type: WasteType;
  hospitalId?: string;

  // Radioactivité
  radionuclide: Radionuclide;
  initialActivity: number; // in MBq
  measureDate: string; // Date et heure de mesure
  doseRateContact: number; // Débit de dose au contact
  doseRate1m: number; // Débit de dose à 1 mètre
  halfLife: number; // in hours
  regulatoryClearanceLevel: number; // Niveau réglementaire

  // Stockage
  storageEntryDate: string;
  storageResponsible: string;
  expectedDecayDuration: number; // in days

  // Sortie et Élimination (If eliminated)
  exitControlDate?: string;
  exitDoseRate?: number;
  exitConformity?: boolean;
  exitController?: string;
  eliminationDate?: string;
  eliminationMode?: string;
  eliminationResponsible?: string;

  status: WasteStatus;
}

export type IncidentType = 'Déversement accidentel' | 'Contamination' | 'Perte de déchet';

export interface Incident {
  id: string;
  date: string;
  personnelFunction: string;
  type: IncidentType;
  doseRateBefore: number;
  correctiveActions: string;
  doseRateAfter: number;
  wasteId?: string;
  hospitalId?: string;
}

export type UserRole = 'Administrateur' | 'Médecin nucléaire' | 'Radiopharmacien' | 'Manipulateur' | 'Physicien médical' | 'Conseiller en radioprotection';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email?: string;
  permissions?: string[];
  lastLogin?: string;
  hospitalId?: string;
}
