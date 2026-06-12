import { WasteItem, Incident, User } from '@/types';
import { addDays, subDays } from 'date-fns';

const now = new Date();

export const mockUsers: User[] = [
  { id: '1', name: 'Dr. Martin', role: 'Médecin nucléaire', email: 'martin@hopital.fr', permissions: ['lecture', 'ajout_dechet'], lastLogin: new Date().toISOString() },
  { id: '2', name: 'Sophie L.', role: 'Radiopharmacien', email: 'sophie@hopital.fr', permissions: ['lecture', 'gestion_totale'], lastLogin: new Date().toISOString() },
  { id: '3', name: 'Jean D.', role: 'Manipulateur', email: 'jean@hopital.fr', permissions: ['lecture', 'ajout_dechet'], lastLogin: subDays(now, 1).toISOString() },
  { id: '4', name: 'Admin Syst', role: 'Administrateur', email: 'admin@hopital.fr', permissions: ['admin_complet'], lastLogin: new Date().toISOString() },
];

export const mockWaste: WasteItem[] = [
  {
    id: 'WST-TC99M-001',
    createdAt: subDays(now, 5).toISOString(),
    originService: 'salle d’injection',
    responsibleOperator: 'Manipulateur',
    type: 'seringue',
    radionuclide: 'Tc-99m',
    initialActivity: 500,
    measureDate: subDays(now, 5).toISOString(),
    doseRateContact: 10,
    doseRate1m: 1,
    halfLife: 6, // hours
    regulatoryClearanceLevel: 0.1,
    storageEntryDate: subDays(now, 5).toISOString(),
    storageResponsible: 'Sophie L.',
    expectedDecayDuration: 3, // days
    status: 'liberable' // It's been 5 days, 99mTc halflife is 6h, completely decayed
  },
  {
    id: 'WST-F18-002',
    createdAt: subDays(now, 2).toISOString(),
    originService: 'labo chaud',
    responsibleOperator: 'Radiopharmacien',
    type: 'flacon',
    radionuclide: 'F-18',
    initialActivity: 1000,
    measureDate: subDays(now, 2).toISOString(),
    doseRateContact: 50,
    doseRate1m: 5,
    halfLife: 1.83, // hours
    regulatoryClearanceLevel: 0.1,
    storageEntryDate: subDays(now, 2).toISOString(),
    storageResponsible: 'Sophie L.',
    expectedDecayDuration: 1,
    status: 'liberable'
  },
  {
    id: 'WST-I131-003',
    createdAt: subDays(now, 10).toISOString(),
    originService: 'salle d’attente chaude',
    responsibleOperator: 'Manipulateur',
    type: 'solide',
    radionuclide: 'I-131',
    initialActivity: 200,
    measureDate: subDays(now, 10).toISOString(),
    doseRateContact: 15,
    doseRate1m: 2,
    halfLife: 192, // 8 days
    regulatoryClearanceLevel: 0.1,
    storageEntryDate: subDays(now, 10).toISOString(),
    storageResponsible: 'Jean D.',
    expectedDecayDuration: 80,
    status: 'stockage'
  }
];

export const mockIncidents: Incident[] = [
  {
    id: 'INC-2024-001',
    date: subDays(now, 15).toISOString(),
    personnelFunction: 'Manipulateur',
    type: 'Déversement accidentel',
    doseRateBefore: 120,
    correctiveActions: 'Nettoyage avec kit de décontamination, isolation de la zone.',
    doseRateAfter: 2,
    wasteId: 'WST-F18-002'
  }
];
