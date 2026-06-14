export type WasteType = 'solide' | 'liquide' | 'biologique' | 'seringue' | 'flacon' | 'tubulure' | 'gants' | 'compresses' | 'autres';
export type Radionuclide =
  | 'Tc-99m' | 'F-18' | 'Ga-68' | 'I-131' | 'I-123' | 'I-125'
  | 'Lu-177' | 'Y-90' | 'In-111' | 'Ga-67' | 'Tl-201' | 'Sm-153'
  | 'Ra-223' | 'Re-186' | 'Sr-89' | 'Cr-51' | 'C-11' | 'autres';
export type WasteStatus = 'stockage' | 'liberable' | 'elimine' | 'incident';

export interface WasteItem {
  id: string; // Identifiant unique du document (clé technique, sans collision)
  registryNumber?: string; // Numéro de registre lisible (affichage)
  createdAt: string; // Date de création (ISO)
  type: string; // Type de déchet (valeur paramétrable)
  hospitalId: string;
  radionuclide: Radionuclide;
  status: WasteStatus;

  // Champs complémentaires (peuvent être renseignés plus tard)
  originService?: string; // Service d'origine (paramétrable)
  responsibleOperator?: string; // Opérateur responsable
  initialActivity?: number; // activité initiale en MBq
  mass?: number; // masse du colis en grammes (nécessaire au calcul de l'activité massique)
  measureDate?: string; // Date et heure de mesure (ISO)
  doseRateContact?: number; // Débit de dose au contact (µSv/h)
  doseRate1m?: number; // Débit de dose à 1 mètre (µSv/h)
  halfLife?: number; // demi-vie physique en heures
  // Niveau de libération en activité massique (Bq/g). Si absent, dérivé de la table du radionucléide.
  clearanceLevelBqPerG?: number;
  // Seuil de débit de dose au contact pour autoriser la libération (µSv/h). Défaut 0,5 si absent.
  releaseDoseThreshold?: number;
  // @deprecated — ancien seuil en MBq, conservé pour compatibilité ascendante uniquement.
  regulatoryClearanceLevel?: number;

  // Stockage
  storageEntryDate?: string;
  storageResponsible?: string;
  expectedDecayDuration?: number; // en jours

  // Activité hospitalière du jour (contexte, optionnel)
  dailyElution?: number; // élution du jour (MBq)
  dailyPatientCount?: number; // nombre de patients du jour
  dailyExamTypes?: string[]; // types d'examens réalisés le jour (multi-sélection)

  // Sortie et Élimination (si éliminé)
  exitControlDate?: string;
  exitDoseRate?: number;
  exitConformity?: boolean;
  exitController?: string;
  exitSignedBy?: string; // e-mail du compte authentifié ayant validé (signature électronique)
  eliminationDate?: string;
  eliminationMode?: string;
  eliminationResponsible?: string;
}

export type IncidentType = 'Déversement accidentel' | 'Contamination' | 'Perte de déchet';

export interface Incident {
  id: string;
  registryNumber?: string;
  date: string;
  type: string; // Type d'incident (valeur paramétrable)
  hospitalId: string;

  // Champs complémentaires (peuvent être renseignés plus tard)
  personnelFunction?: string;
  doseRateBefore?: number;
  correctiveActions?: string;
  doseRateAfter?: number;
  wasteId?: string;
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

/** Listes paramétrables par établissement (éditables par l'administrateur). */
export interface AppSettings {
  hospitalId: string;
  originServices: string[];
  wasteTypes: string[];
  eliminationModes: string[];
  incidentTypes: string[];
  examTypes: string[];
}
