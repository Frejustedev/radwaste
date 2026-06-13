import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getAuth, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Configuration Firebase web (clés publiques, non secrètes) lue depuis les variables
// d'environnement NEXT_PUBLIC_FIREBASE_* (cf. .env.example). La sécurité réelle repose sur
// firestore.rules + Firebase App Check, pas sur la confidentialité de cette config.
const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const databaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID;

if (!firebaseConfig.apiKey && typeof window !== 'undefined') {
  console.error('Configuration Firebase manquante : renseignez les variables NEXT_PUBLIC_FIREBASE_* (voir .env.example).');
}

const app = getApps().find((a) => a.name === '[DEFAULT]') || initializeApp(firebaseConfig);
export const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
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
