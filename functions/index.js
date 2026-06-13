/**
 * Cloud Functions RadWaste — voie de production recommandée pour la gestion des comptes.
 *
 * Objectif : éviter toute création de compte / attribution de rôle côté client (cf. audit
 * SEC-03/SEC-06/SEC-09). Le rôle et le hospitalId sont posés en CUSTOM CLAIMS, ce qui permet
 * aux règles Firestore de s'appuyer sur request.auth.token.role / .hospitalId sans get().
 *
 * Déploiement : `firebase deploy --only functions` (plan Blaze requis).
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

const ROLES = ['Administrateur', 'Médecin nucléaire', 'Radiopharmacien', 'Manipulateur', 'Physicien médical', 'Conseiller en radioprotection'];

function assertAdmin(request) {
  const token = request.auth && request.auth.token;
  if (!token || token.role !== 'Administrateur') {
    throw new HttpsError('permission-denied', 'Réservé aux administrateurs.');
  }
  return token;
}

function defaultPermissions(role) {
  if (role === 'Administrateur') return ['admin_complet'];
  if (role === 'Radiopharmacien') return ['lecture', 'gestion_totale'];
  if (role === 'Manipulateur' || role === 'Médecin nucléaire') return ['lecture', 'ajout_dechet'];
  return ['lecture'];
}

/** Crée un compte (Auth + profil + custom claims) dans l'établissement de l'administrateur appelant. */
exports.createUser = onCall(async (request) => {
  const adminToken = assertAdmin(request);
  const { name, email, password, role } = request.data || {};

  if (!name || !email || !password) throw new HttpsError('invalid-argument', 'Nom, email et mot de passe requis.');
  if (!ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Rôle invalide.');
  if (String(password).length < 6) throw new HttpsError('invalid-argument', 'Mot de passe trop court (min. 6).');

  const hospitalId = adminToken.hospitalId;
  if (!hospitalId) throw new HttpsError('failed-precondition', "L'administrateur n'a pas de hospitalId.");

  const cleanEmail = String(email).trim().toLowerCase();
  const userRecord = await admin.auth().createUser({ email: cleanEmail, password, displayName: name });

  await admin.auth().setCustomUserClaims(userRecord.uid, { role, hospitalId });

  await admin.firestore().collection('users').doc(userRecord.uid).set({
    id: userRecord.uid,
    name,
    email: cleanEmail,
    role,
    hospitalId,
    permissions: defaultPermissions(role),
    lastLogin: new Date().toISOString(),
  });

  return { uid: userRecord.uid };
});

/** Modifie le rôle d'un utilisateur (custom claim + profil), dans le même établissement. */
exports.setUserRole = onCall(async (request) => {
  const adminToken = assertAdmin(request);
  const { uid, role } = request.data || {};
  if (!uid || !ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Paramètres invalides.');

  const target = await admin.firestore().collection('users').doc(uid).get();
  if (!target.exists || target.data().hospitalId !== adminToken.hospitalId) {
    throw new HttpsError('permission-denied', 'Utilisateur hors de votre établissement.');
  }

  await admin.auth().setCustomUserClaims(uid, { role, hospitalId: adminToken.hospitalId });
  await admin.firestore().collection('users').doc(uid).update({ role, permissions: defaultPermissions(role) });
  return { ok: true };
});

/** Supprime un compte (Auth + profil), sauf soi-même. */
exports.deleteUser = onCall(async (request) => {
  const adminToken = assertAdmin(request);
  const { uid } = request.data || {};
  if (!uid) throw new HttpsError('invalid-argument', 'uid requis.');
  if (uid === request.auth.uid) throw new HttpsError('failed-precondition', 'Impossible de supprimer son propre compte.');

  const target = await admin.firestore().collection('users').doc(uid).get();
  if (!target.exists || target.data().hospitalId !== adminToken.hospitalId) {
    throw new HttpsError('permission-denied', 'Utilisateur hors de votre établissement.');
  }

  await admin.auth().deleteUser(uid).catch(() => {});
  await admin.firestore().collection('users').doc(uid).delete();
  return { ok: true };
});
