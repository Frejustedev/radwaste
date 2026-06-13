import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getAuth, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import localFirebaseConfig from '../firebase-applet-config.json';

// La configuration Firebase web n'est pas un secret (clé publique côté client), mais elle
// est fournie en priorité par variables d'environnement ; le fichier local ne sert que de
// repli en développement. La sécurité réelle repose sur firestore.rules + Firebase App Check.
const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || localFirebaseConfig.apiKey,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || localFirebaseConfig.authDomain,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || localFirebaseConfig.projectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || localFirebaseConfig.storageBucket,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || localFirebaseConfig.messagingSenderId,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || localFirebaseConfig.appId,
};

const databaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || localFirebaseConfig.firestoreDatabaseId;

const app = getApps().find((a) => a.name === '[DEFAULT]') || initializeApp(firebaseConfig);
export const db = getFirestore(app, databaseId);
export const auth = getAuth(app);

// Instance secondaire utilisée uniquement pour la création de comptes côté client en repli,
// afin de ne pas déconnecter l'administrateur courant. La voie recommandée est la Cloud
// Function `createUser` (voir functions/), qui évite toute création de compte côté client.
const secondaryApp = getApps().find((a) => a.name === 'Secondary') || initializeApp(firebaseConfig, 'Secondary');
export const secondaryAuth = getAuth(secondaryApp);

export async function logout(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Erreur lors de la déconnexion', error);
  }
}
