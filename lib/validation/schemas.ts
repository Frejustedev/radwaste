import type { WasteItem, Incident, User, ActionLog, WasteStatus, UserRole } from '@/types';

const WASTE_STATUSES: WasteStatus[] = ['stockage', 'liberable', 'elimine', 'incident'];
const USER_ROLES: UserRole[] = ['Administrateur', 'Médecin nucléaire', 'Radiopharmacien', 'Manipulateur', 'Physicien médical', 'Conseiller en radioprotection'];

export interface FieldError {
  field: string;
  message: string;
}

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: FieldError[];
}

/** Parse un nombre strictement positif (ou >= 0 si allowZero). Renvoie null si invalide. */
export function parsePositiveNumber(raw: unknown, { allowZero = false }: { allowZero?: boolean } = {}): number | null {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!Number.isFinite(n)) return null;
  if (allowZero ? n < 0 : n <= 0) return null;
  return n;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export interface WasteFormValue {
  originService?: string;
  initialActivity?: number;
  mass?: number;
  halfLife?: number;
  doseRateContact?: number;
  doseRate1m?: number;
  clearanceLevelBqPerG?: number;
  measureDate?: string;
  dailyHospitalActivity?: number;
  dailyElution?: number;
  dailyPatientCount?: number;
}

/**
 * Valide le formulaire d'identification. Seuls le TYPE et le RADIONUCLÉIDE sont obligatoires :
 * tous les autres champs peuvent être renseignés plus tard. Un champ rempli mais invalide
 * produit une erreur explicite (pas de valeur par défaut silencieuse).
 */
export function validateWasteForm(input: {
  originService: string;
  type: string;
  radionuclide: string;
  initialActivity: string;
  mass: string;
  halfLife: string;
  measureDate: string;
  doseRateContact: string;
  doseRate1m: string;
  clearanceLevelBqPerG: string;
  dailyHospitalActivity: string;
  dailyElution: string;
  dailyPatientCount: string;
}): ValidationResult<WasteFormValue> {
  const errors: FieldError[] = [];

  if (!isNonEmptyString(input.type)) errors.push({ field: 'type', message: 'Type de déchet requis.' });
  if (!isNonEmptyString(input.radionuclide)) errors.push({ field: 'radionuclide', message: 'Radionucléide requis.' });

  // Champ numérique optionnel : ignoré si vide, validé s'il est renseigné.
  const optionalNumber = (raw: string, field: string, label: string, allowZero = false): number | undefined => {
    if (!isNonEmptyString(raw)) return undefined;
    const n = parsePositiveNumber(raw, { allowZero });
    if (n === null) { errors.push({ field, message: `${label} : valeur invalide.` }); return undefined; }
    return n;
  };

  const initialActivity = optionalNumber(input.initialActivity, 'initialActivity', 'Activité initiale (MBq)');
  const mass = optionalNumber(input.mass, 'mass', 'Masse du colis (g)');
  const halfLife = optionalNumber(input.halfLife, 'halfLife', 'Demi-vie physique (h)');
  const doseRateContact = optionalNumber(input.doseRateContact, 'doseRateContact', 'Débit de dose au contact', true);
  const doseRate1m = optionalNumber(input.doseRate1m, 'doseRate1m', 'Débit de dose à 1 m', true);
  const clearanceLevelBqPerG = optionalNumber(input.clearanceLevelBqPerG, 'clearanceLevelBqPerG', 'Niveau de libération (Bq/g)');
  const dailyHospitalActivity = optionalNumber(input.dailyHospitalActivity, 'dailyHospitalActivity', 'Activité hospitalière du jour (MBq)', true);
  const dailyElution = optionalNumber(input.dailyElution, 'dailyElution', 'Élution du jour (MBq)', true);
  const dailyPatientCount = optionalNumber(input.dailyPatientCount, 'dailyPatientCount', 'Nombre de patients du jour', true);

  let measureDate: string | undefined;
  if (isNonEmptyString(input.measureDate)) {
    const d = new Date(input.measureDate);
    if (Number.isNaN(d.getTime())) errors.push({ field: 'measureDate', message: 'Date de mesure invalide.' });
    else measureDate = d.toISOString();
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: {
      originService: isNonEmptyString(input.originService) ? input.originService : undefined,
      initialActivity,
      mass,
      halfLife,
      doseRateContact,
      doseRate1m,
      clearanceLevelBqPerG,
      measureDate,
      dailyHospitalActivity,
      dailyElution,
      dailyPatientCount,
    },
  };
}

// ---------------------------------------------------------------
// Validation stricte pour la restauration de sauvegarde
// ---------------------------------------------------------------

function checkWasteItem(o: unknown): o is WasteItem {
  if (typeof o !== 'object' || o === null) return false;
  const w = o as Record<string, unknown>;
  return isNonEmptyString(w.id)
    && typeof w.radionuclide === 'string'
    && typeof w.status === 'string' && WASTE_STATUSES.includes(w.status as WasteStatus)
    && (w.initialActivity === undefined || typeof w.initialActivity === 'number')
    && (w.halfLife === undefined || typeof w.halfLife === 'number')
    && (w.mass === undefined || typeof w.mass === 'number');
}

function checkIncident(o: unknown): o is Incident {
  if (typeof o !== 'object' || o === null) return false;
  const i = o as Record<string, unknown>;
  return isNonEmptyString(i.id)
    && isNonEmptyString(i.date)
    && typeof i.type === 'string'
    && (i.doseRateBefore === undefined || typeof i.doseRateBefore === 'number')
    && (i.doseRateAfter === undefined || typeof i.doseRateAfter === 'number');
}

function checkUser(o: unknown): o is User {
  if (typeof o !== 'object' || o === null) return false;
  const u = o as Record<string, unknown>;
  return isNonEmptyString(u.id)
    && isNonEmptyString(u.name)
    && typeof u.role === 'string' && USER_ROLES.includes(u.role as UserRole);
}

export interface ParsedBackup {
  wasteItems: WasteItem[];
  incidents: Incident[];
  users: User[];
  actionLogs: ActionLog[];
}

/**
 * Valide intégralement un fichier de sauvegarde. Rejette le fichier entier si un seul
 * enregistrement est invalide (pas de restauration partielle silencieuse).
 */
export function validateBackup(raw: unknown): ValidationResult<ParsedBackup> {
  const errors: FieldError[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, errors: [{ field: 'fichier', message: 'Format de fichier invalide (objet JSON attendu).' }] };
  }
  const data = raw as Record<string, unknown>;
  const wasteItems = Array.isArray(data.wasteItems) ? data.wasteItems : null;
  const incidents = Array.isArray(data.incidents) ? data.incidents : null;
  const users = Array.isArray(data.users) ? data.users : null;
  const actionLogs = Array.isArray(data.actionLogs) ? data.actionLogs : [];

  if (!wasteItems) errors.push({ field: 'wasteItems', message: 'Section "wasteItems" manquante ou invalide.' });
  if (!incidents) errors.push({ field: 'incidents', message: 'Section "incidents" manquante ou invalide.' });
  if (!users) errors.push({ field: 'users', message: 'Section "users" manquante ou invalide.' });
  if (errors.length > 0) return { ok: false, errors };

  wasteItems!.forEach((w, idx) => { if (!checkWasteItem(w)) errors.push({ field: `wasteItems[${idx}]`, message: 'Déchet invalide.' }); });
  incidents!.forEach((i, idx) => { if (!checkIncident(i)) errors.push({ field: `incidents[${idx}]`, message: 'Incident invalide.' }); });
  users!.forEach((u, idx) => { if (!checkUser(u)) errors.push({ field: `users[${idx}]`, message: 'Utilisateur invalide.' }); });

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: {
      wasteItems: wasteItems as WasteItem[],
      incidents: incidents as Incident[],
      users: users as User[],
      actionLogs: actionLogs as ActionLog[],
    },
  };
}
