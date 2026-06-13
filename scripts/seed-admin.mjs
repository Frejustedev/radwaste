/**
 * Crée (ou met à jour) le PREMIER administrateur de l'établissement.
 *
 * Indispensable car les règles Firestore interdisent désormais l'auto-création d'admin
 * (l'ancienne backdoor codée en dur a été supprimée — cf. audit SEC-06). À lancer une seule
 * fois, hors application, avec une clé de service Admin SDK.
 *
 * Prérequis :
 *   npm i firebase-admin
 *   export GOOGLE_APPLICATION_CREDENTIALS=/chemin/serviceAccountKey.json
 *
 * Usage :
 *   node scripts/seed-admin.mjs <email> <motDePasse> "<Nom Complet>" <hospitalId>
 */
import admin from 'firebase-admin';

const [, , email, password, name, hospitalId = 'default-hospital'] = process.argv;

if (!email || !password || !name) {
  console.error('Usage: node scripts/seed-admin.mjs <email> <password> "<Nom>" [hospitalId]');
  process.exit(1);
}

admin.initializeApp();

const cleanEmail = email.trim().toLowerCase();

async function main() {
  let user;
  try {
    user = await admin.auth().getUserByEmail(cleanEmail);
    await admin.auth().updateUser(user.uid, { password, displayName: name });
  } catch {
    user = await admin.auth().createUser({ email: cleanEmail, password, displayName: name });
  }

  await admin.auth().setCustomUserClaims(user.uid, { role: 'Administrateur', hospitalId });

  await admin.firestore().collection('users').doc(user.uid).set({
    id: user.uid,
    name,
    email: cleanEmail,
    role: 'Administrateur',
    hospitalId,
    permissions: ['admin_complet'],
    lastLogin: new Date().toISOString(),
  });

  console.log(`✓ Administrateur prêt : ${cleanEmail} (uid=${user.uid}, hospitalId=${hospitalId})`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Échec du seed admin :', err);
  process.exit(1);
});
