# Audit complet — RadWaste Pro

> Application de gestion des déchets radioactifs en médecine nucléaire (Next.js 15 / React 19 / Firebase).
> Audit multi-agents : 6 dimensions (sécurité, conformité radiophysique, intégrité des données, architecture, UX/accessibilité, build) — chaque constat vérifié de façon adverse sur le code réel.

**Date :** 2026-06-13  ·  **Constats confirmés :** 57  ·  **Rejetés :** 0

## Répartition par gravité

| Gravité | Nombre |
|---|---|
| P0 — Critique | 10 |
| P1 — Élevé | 20 |
| P2 — Moyen | 19 |
| P3 — Mineur | 8 |
| **Total** | **57** |

---

## Détail des constats

## P0 — Critique

### [DATA-01] Génération d'ID par length+1 + setDoc sans merge : écrasement silencieux d'enregistrements (perte de traçabilité ASN)

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.665, 683, 776, 1059, 1069`
- **Problème :** Confirmé dans le code. ID déchet l.665 `id: \`WST-${isotopeCode}-${String(wasteItems.length + 1).padStart(3, '0')}\`` puis écriture l.683 `setDoc(doc(db, 'wasteItems', newItem.id!), newItem)`. ID incident l.1059 `id: \`INC-2024-${String(incidents.length + 1).padStart(3, '0')}\`` puis l.1069 `setDoc(doc(db, 'incidents', newIncident.id!), newIncident)`. setDoc sans {merge:true} remplace intégralement un document existant de même ID. wasteItems/incidents reflètent tous les statuts (listeners l.94-103 filtrent uniquement par hospitalId, aucun filtre de statut). La numérotation déchet inclut le code isotope mais length compte TOUS isotopes confondus, donc length+1 n'est pas un compteur par isotope : un Tc-99m peut recevoir un suffixe déjà attribué à un autre Tc-99m après variation du total. Le scénario incident est le plus net : suppression via deleteDoc (l.1092) réduit incidents.length, la création suivante recalcule length+1 = un numéro déjà existant → écrasement.
- **Impact :** Perte de données irréversible et silencieuse sur application présentée comme conforme ASN. Un enregistrement de déchet radioactif ou un rapport d'incident (déversement, contamination, perte) peut être écrasé sans erreur ni avertissement après une suppression. La traçabilité réglementaire — exigence de sûreté — est rompue.
- **Correctif :** Ne jamais dériver un ID de array.length. Utiliser addDoc (ID auto Firestore) en stockant le numéro de registre lisible dans un champ séparé, ou crypto.randomUUID(), ou un compteur transactionnel (runTransaction sur un doc 'counters'). Si un numéro séquentiel lisible est requis, le calculer dans une transaction lisant le dernier numéro persistant. Conditionner setDoc à l'absence préalable (getDoc) ou faire respecter l'unicité par les règles.
- **Vérification :** CONFIRMÉ par lecture directe. Lignes exactes vérifiées : 665, 683 (déchets), 1059, 1069 (incidents), 776 (filtre status==='stockage' à l'affichage), 1092 (deleteDoc incident). Les listeners l.93-103 ne filtrent que sur hospitalId. setDoc sans merge écrase bien tout le document. P0 maintenu : sur appli réglementée de gestion de déchets radioactifs, l'écrasement silencieux d'un registre (incident de perte/contamination) est une perte de traçabilité réglementaire majeure. Le chemin de collision le plus reproductible est l'incident après suppression (l.1092 réduit length). Pour les déchets, le suffixe isotope limite mais n'élimine pas le risque (length global), et la suppression d'un déchet (l.711) le rend reproductible. Sévérité non exagérée.

### [DATA-02] Restauration de sauvegarde : aucune validation de schéma, aucune confirmation, merge partiel laissant des données orphelines, logs non restaurés

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.1496-1543`
- **Problème :** Confirmé. handleRestore (l.1513-1543) : JSON.parse l.1522, simple test de présence `if (data.wasteItems && data.incidents && data.users)` l.1523 (aucune validation de type/contenu), puis boucles `for (const item of data.wasteItems) await setDoc(doc(db, 'wasteItems', item.id), item)` l.1528-1530. (1) Aucune confirmation utilisateur avant écriture en base. (2) Aucune validation : si item.id absent → doc(db, 'wasteItems', undefined) lève une exception ; les règles firestore.rules l.52-62 n'invoquent PAS isValidWasteItem/isValidIncident/isValidUser (elles ne testent que isSignedIn()), donc aucun filet côté serveur non plus. (3) UPSERT partiel : le commentaire l.1526-1527 confirme 'For safety we'll just overwrite' ; les documents en base absents du backup ne sont pas supprimés → état hybride (deleteDoc est importé l.1525 mais jamais appelé). (4) actionLogs sauvegardés l.1501 mais jamais restaurés (l.1528-1530 n'écrit que wasteItems/incidents/users) → journal d'audit perdu. (5) Aucune vérification du hospitalId des items importés.
- **Impact :** Corruption ou perte de données sur appli médicale réglementée. Restauration accidentelle ou fichier altéré peut injecter des données arbitraires, créer un état incohérent (incidents orphelins / déchets fantômes), faire disparaître le journal d'audit, sans aucun garde-fou. Les setDoc séquentiels non atomiques peuvent laisser une restauration partiellement appliquée en cas d'échec en cours de boucle.
- **Correctif :** Ajouter une confirmation explicite (modal type 'taper CONFIRMER'). Valider strictement chaque enregistrement (champs obligatoires, types, format d'id, hospitalId attendu) et rejeter le fichier entier si un item est invalide. Choisir une sémantique claire : restauration transactionnelle complète (wipe + réécriture par writeBatch, logs inclus) ou merge documenté. Restaurer aussi actionLogs ou les retirer du backup. Utiliser writeBatch pour l'atomicité au lieu d'une boucle de setDoc.
- **Vérification :** CONFIRMÉ intégralement par lecture de page.tsx l.1496-1543 ET firestore.rules. Point (2) vérifié : firestore.rules définit bien isValidWasteItem (l.24), isValidIncident (l.34), isValidUser (l.44) mais les blocs match l.52-62 ne les appellent PAS — ils utilisent uniquement `allow read, write: if isSignedIn()`. Donc aucune validation ni client ni serveur. Point (3) : deleteDoc est importé l.1525 mais jamais utilisé (suppression vérifiée). Point (4) : confirmé, seuls 3 collections réécrites. P0 maintenu : combinaison absence de confirmation + absence de validation + perte du journal d'audit sur appli réglementée = risque destructif réel. Sévérité justifiée.

### [REG-01] Critère de libération réduit à l'activité totale : ni activité massique, ni débit de dose, ni règle des 10 périodes

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.818-846 (handleCheckThresholds), 598-602 (calculateResidual), 824, 751 (label)`
- **Problème :** handleCheckThresholds (l.818-846) passe un déchet de 'stockage' à 'liberable' dès que `residual <= w.regulatoryClearanceLevel` (l.824), où residual = parseFloat(calculateResidual(w)) est l'activité TOTALE résiduelle en MBq (calculateResidual l.598-602 : initialActivity * 0.5^(t/T½)). Le seuil regulatoryClearanceLevel est explicitement en MBq (label l.751 'Séuil réglementaire (MBq)' [sic], types.ts l.20) et non en Bq/g. La libération réglementaire en médecine nucléaire repose sur l'activité massique (Bq/g) propre au radionucléide. Aucun contrôle du nombre de périodes écoulées ni du débit de dose au contact (doseRateContact/doseRate1m) n'est exigé par handleCheckThresholds.
- **Impact :** L'application peut classer 'libérable' et orienter vers une filière classique un déchet ne satisfaisant pas les critères réglementaires réels (activité massique, >=10 périodes, débit de dose à la sortie). Risque direct de sortie de matière radioactive dans une filière non autorisée et fausse assurance de conformité, sur un outil intitulé 'Registre Réglementaire'.
- **Correctif :** Remplacer le critère par une combinaison conforme : (1) activité massique = activité résiduelle / masse du colis comparée au niveau de libération en Bq/g par radionucléide ; (2) temps écoulé depuis measureDate >= 10·T½ ; (3) contrôle obligatoire du débit de dose à la sortie comparé au bruit de fond. Retyper regulatoryClearanceLevel en Bq/g, ajouter un champ masse, et stocker une table de niveaux de libération par isotope. Bloquer la libération si l'un des trois critères échoue.
- **Vérification :** CONFIRMÉ par lecture directe : l.824 `if (residual <= w.regulatoryClearanceLevel)` avec residual = activité totale MBq (calculateResidual l.598-602). Label l.751 confirme l'unité MBq ; types.ts l.20 typé number sans unité Bq/g. Aucune référence à un nombre de périodes ni à doseRateContact/doseRate1m dans handleCheckThresholds. Sévérité P0 maintenue : c'est la barrière de classification réglementaire la plus critique et elle est physiquement/réglementairement erronée.

### [REG-02] Valeurs par défaut radiophysiques dangereuses (halfLife||6, clearance||0.1, activité/dose||0)

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.655, 657-660 (édition), 672, 674-677 (création)`
- **Problème :** À l'édition (updateDoc) comme à la création (newItem) : `halfLife: Number(formData.halfLife) || 6` (l.659 et 676) force 6 h (Tc-99m) si le champ est vide OU égal à 0 ; `regulatoryClearanceLevel ... || 0.1` (l.660, 677) impose 0.1 par défaut ; `initialActivity ... || 0` (l.655, 672) et `doseRateContact ... || 0` (l.657, 674) mettent activité et débit à 0. Comme 0 est falsy en JS, une demi-vie saisie à 0 devient 6, une activité saisie à 0 reste 0. Pour I-131 (T½≈192 h) ou Lu-177 (≈160 h) saisis sans demi-vie, la décroissance serait calculée avec 6 h : l'activité résiduelle s'effondrerait artificiellement et le déchet deviendrait 'libérable' alors qu'il reste fortement actif.
- **Impact :** Sous-estimation massive de l'activité résiduelle pour tout isotope à vie longue mal saisi -> libération prématurée d'un déchet dangereux. Une activité initiale par défaut à 0 fausse aussi totalActivity du dashboard (l.156-163). Atteinte directe à la sûreté.
- **Correctif :** Ne jamais substituer une valeur radiophysique par un défaut implicite. Rendre halfLife, initialActivity et regulatoryClearanceLevel obligatoires et validés (> 0), de préférence pré-remplis depuis une table de référence par radionucléide (T½ officielle), avec rejet du formulaire si invalide. Supprimer les `|| 6`, `|| 0.1`, `|| 0` sur ces champs radiophysiques.
- **Vérification :** CONFIRMÉ : lignes exactes vérifiées. Édition l.655,657,659,660 ; création l.672,674,676,677. Les champs sont marqués `required` dans le formulaire (l.748-752) mais handleSubmit n'effectue AUCUNE validation numérique (seul test l.645 : originService/type/radionuclide non vides) — la garde HTML 'required' n'empêche pas une valeur 0 ni la coercition `|| 6`. Le piège JS (0 falsy) est réel : une demi-vie 0 devient 6. Sévérité P0 maintenue.

### [REG-03] Registre de logs non inviolable : horodatage côté client, écriture/suppression libre, aucune signature ni non-répudiation

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/firestore.rules — l.firestore.rules 64-66 ; app/page.tsx 168-179 (logAction)`
- **Problème :** Règles Firestore pour la collection logs : `match /logs/{logId} { allow read, write: if isSignedIn(); }` (l.64-66) — tout utilisateur authentifié peut CRÉER, MODIFIER et SUPPRIMER n'importe quelle entrée. L'horodatage est posé côté client (`date: new Date().toISOString()`, page.tsx l.173) donc falsifiable, et l'auteur est `currentUserProfile?.email || 'Système'` (l.174), chaîne libre sans lien cryptographique avec request.auth. Aucun champ de signature, de hash chaîné, ni append-only. Un registre réglementaire doit garantir intégrité, horodatage fiable, identité non répudiable et inaltérabilité.
- **Impact :** Le 'registre réglementaire' n'a aucune valeur probante : un opérateur peut antidater, réécrire ou effacer des mouvements (création, libération, élimination, incidents). En cas de contrôle ou d'incident, le registre est inexploitable. Non-conformité à l'exigence de traçabilité inviolable.
- **Correctif :** Sur logs : `allow update, delete: if false;`, autoriser uniquement create, imposer l'horodatage serveur (request.time / serverTimestamp()) et `incoming().userEmail == request.auth.token.email` dans les rules. Idéalement chaîner les entrées (hash du log précédent) ou recourir à un stockage WORM/append-only, et exiger une signature électronique du responsable radioprotection pour les actes de libération/élimination.
- **Vérification :** CONFIRMÉ mot pour mot : rules l.64-66 `allow read, write: if isSignedIn();` (aucune des fonctions isValid* n'est appliquée ici). page.tsx l.173 horodatage client, l.174 auteur = chaîne email du profil ou 'Système'. Aucune contrainte de format/serveur/append-only. Sévérité P0 maintenue : l'inviolabilité du registre est l'exigence réglementaire de fond, et elle est totalement absente.

### [SEC-01] Règles Firestore : aucune autorisation réelle, simple test isSignedIn() sur toutes les collections

- **Localisation :** `firestore.rules — l.52-66 (def isSignedIn 8-10)`
- **Problème :** Confirmé dans le code. Les quatre collections wasteItems (53), incidents (57), users (61), logs (65) sont toutes protégées par le seul `allow read, write: if isSignedIn();`. isSignedIn() (lignes 8-10) retourne uniquement `request.auth != null`. La règle catch-all `match /{document=**} { allow read, write: if false; }` (lignes 4-6) ne protège que les chemins non explicitement matchés ; les quatre collections métier sont, elles, totalement ouvertes à tout compte authentifié. Aucune vérification de rôle, de propriété ni de hospitalId côté serveur.
- **Impact :** Tout compte authentifié (y compris un Manipulateur) peut lire, créer, modifier et supprimer n'importe quel document de n'importe quelle collection via le SDK ou des requêtes REST directes, en contournant entièrement l'UI : suppression du registre réglementaire, falsification des activités initiales/demi-vies (faussant la décroissance et les libérations), effacement d'incidents, réécriture des logs d'audit. Perte/altération totale d'intégrité et de traçabilité sur une appli médicale réglementée ASN.
- **Correctif :** Réécrire chaque bloc match : (1) isolation par hospitalId via custom claim (request.auth.token.hospitalId == resource.data.hospitalId, idem request.resource.data en création), (2) RBAC serveur basé sur le rôle (idéalement custom claim, ou get() sur le doc users de l'appelant), (3) validation de schéma via les fonctions déjà présentes (SEC-02). Rendre les logs append-only. N'autoriser l'écriture de /users qu'aux administrateurs.
- **Vérification :** PREUVE directe lue dans firestore.rules : lignes 8-10 (isSignedIn = request.auth != null), lignes 53/57/61/65 (allow read, write: if isSignedIn()). Sévérité P0 maintenue : faille d'autorisation racine dont découlent SEC-02/03/04/05/08/10. Reproductible par n'importe quel utilisateur authentifié.

### [SEC-03] Escalade de privilèges : un utilisateur peut s'auto-promouvoir admin_complet en écrivant dans /users

- **Localisation :** `firestore.rules + app/page.tsx + types.ts — l.firestore.rules:60-62 ; types.ts:55-63 ; app/page.tsx:1337-1352, 82-87`
- **Problème :** Confirmé. Le bloc `match /users/{userId} { allow read, write: if isSignedIn(); }` (firestore.rules 60-62) autorise tout utilisateur connecté à écrire n'importe quel document users, y compris le sien. Le profil contient role et permissions[] (types.ts 55-63, role: UserRole, permissions?: string[]). C'est ce role/permissions qui détermine les droits applicatifs (mapping role->permissions en page.tsx 1337-1340, ex. Administrateur => ['admin_complet']). Rien n'empêche un utilisateur d'exécuter directement un setDoc/updateDoc sur doc(db,'users',monUid) avec `role:'Administrateur', permissions:['admin_complet']`. La preuve que ces champs sont stockés en clair dans Firestore et lus comme source de vérité figure en page.tsx 86-89 (setDoc admin) et 1374 (setDoc création utilisateur).
- **Impact :** N'importe quel compte authentifié devient administrateur complet en une requête Firestore directe, sans passer par l'UI. Il prend ensuite le contrôle total via l'UI (gestion utilisateurs, suppression de comptes, backup/restore). Escalade de privilèges verticale complète sur une application de sûreté radiologique.
- **Correctif :** Interdire à un utilisateur de modifier role/permissions de son propre document. Stocker le rôle dans des custom claims Firebase positionnés par une Cloud Function admin et baser les règles sur request.auth.token.role. À défaut, n'autoriser l'écriture des champs role/permissions que si l'appelant est déjà admin (`get(/databases/$(db)/documents/users/$(request.auth.uid)).data.role == 'Administrateur'`). Garder en tête que SEC-08 (restore) et SEC-09 (création) offrent aussi cette escalade.
- **Vérification :** PREUVE : firestore.rules:60-62 (write libre sur /users), types.ts:55-63 (role+permissions dans le doc), page.tsx:1337-1340 (mapping role->permissions), page.tsx:86-87 et 1374 (le doc users stocke bien role/permissions). Sévérité P0 maintenue : escalade verticale triviale et directement exploitable.

### [SEC-04] Cloisonnement multi-tenant (hospitalId) garanti uniquement côté client

- **Localisation :** `app/page.tsx + firestore.rules — l.page.tsx:93,99,105,114 (filtres client) et 79,172,1366 (valeur en dur) ; firestore.rules:52-66`
- **Problème :** Confirmé. L'isolation entre hôpitaux repose exclusivement sur des clauses client `where('hospitalId','==','default-hospital')` (page.tsx 93 wasteItems, 99 incidents, 105 users, 114 logs). Côté serveur, les règles (firestore.rules 52-66) n'imposent AUCUNE contrainte sur hospitalId : un utilisateur peut requêter une collection sans filtre et lire les données de tout autre hôpital, ou écrire des documents avec un hospitalId arbitraire. De plus la valeur est codée en dur 'default-hospital' (page.tsx 79 admin bootstrap, 172 logAction, 1366 création utilisateur), donc le multi-tenant n'est de toute façon pas réellement segmenté. NB : l'audit citait aussi les lignes 667/1061 ; je n'ai pas relu ces lignes précises mais les occurrences confirmées (79,172,1366) plus l'absence totale de contrainte serveur suffisent à établir le constat.
- **Impact :** En déploiement multi-établissements, un utilisateur d'un hôpital pourrait lire et altérer les déchets radioactifs, incidents et données personnel d'un autre établissement (fuite de données médicales et atteinte à l'intégrité inter-tenant). La frontière n'est appliquée que là où elle n'a aucune valeur (le client).
- **Correctif :** Faire respecter hospitalId dans les règles via custom claim : `allow read, write: if isSignedIn() && resource.data.hospitalId == request.auth.token.hospitalId` (et sur request.resource.data en création). Ne jamais traiter une valeur codée en dur côté client comme une frontière de sécurité ; rendre hospitalId dynamique et imposé serveur.
- **Vérification :** PREUVE : page.tsx 93/99/105/114 (where hospitalId client), 79/172/1366 ('default-hospital' en dur), firestore.rules 52-66 (aucune contrainte hospitalId). Sévérité P0 maintenue car la promesse de cloisonnement multi-tenant est entièrement contournable côté serveur. Caveat mineur : lignes 667/1061 non revérifiées individuellement, sans impact sur la conclusion.

### [SEC-05] Aucune application du RBAC : permissions[] décoratif, tous les modules accessibles à tout utilisateur autorisé

- **Localisation :** `app/page.tsx — l.296-317 (garde unique), 397-409, 444-470, 1318-1490, 1461-1466`
- **Problème :** Confirmé. Le tableau permissions est calculé à la création/édition d'utilisateur (page.tsx 1337-1340) et seulement AFFICHÉ (1461-1466) ; il n'est consulté nulle part pour conditionner une action. Grep confirme qu'aucune garde de type hasPermission/permissions.includes/role===/role!== n'existe dans tout le fichier (seules occurrences : la définition state ligne 43, l'affichage ligne 174, et le mapping de création 1338-1340). La navigation (NavButton 397-409, dont 'Gestion Utilisateurs' 403) et le rendu des vues (444-470, dont UsersView 462-463 et SettingsView/backup-restore 465-466) sont rendus inconditionnellement. La SEULE garde d'accès est `if (!currentUserProfile)` (ligne 296) qui affiche 'Accès Non Autorisé' : elle bloque uniquement les comptes Auth SANS document users correspondant, mais une fois un profil présent (quel que soit le rôle), TOUTES les vues et actions sont accessibles.
- **Impact :** Tout utilisateur dont le profil users existe accède à TOUTES les fonctions : créer/supprimer des utilisateurs (UsersView), libérer/éliminer des déchets, supprimer le registre, sauvegarder/restaurer la base (SettingsView). Le RBAC annoncé est purement cosmétique. Combiné à SEC-01/SEC-03, aucun cloisonnement fonctionnel n'existe, ni côté UI ni côté serveur.
- **Correctif :** Implémenter un RBAC réel : (1) côté UI, masquer/désactiver NavButton et vues sensibles (Gestion Utilisateurs, Paramètres/restore) selon currentUserProfile.role/permissions ; (2) côté serveur (source de vérité), conditionner chaque write Firestore au rôle (cf. SEC-01/03). L'UI ne suffit jamais ; l'application doit être imposée dans les règles.
- **Vérification :** PREUVE : Grep sur hasPermission|permissions.includes|role===|role!==|admin_complet|currentUserProfile => aucune garde conditionnelle hors affichage. Lecture de page.tsx 296-317 (seule garde = profil existant), 397-409 (nav inconditionnelle), 444-470 (vues inconditionnelles). Sévérité P0 maintenue. Précision apportée à la description : il existe une garde minimale ligne 296, mais elle ne filtre pas par rôle — donc le RBAC reste inexistant.

### [UX-01] Échec silencieux des mutations critiques : aucun retour utilisateur (sûreté/traçabilité)

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.176, 661, 683, 720, 940-942, 1056, 1069, 1092, 1402`
- **Problème :** La majorité des écritures Firestore se terminent par `.catch(err => console.error(...))` sans affichage écran et sans confirmation de succès. Vérifié dans le code : log d'action `.catch(err => console.error("Error logging action:", err))` (176) ; mise à jour déchet (661) et création déchet (683) `.then(() => logAction(...)).catch(err => console.error(err))` ; suppression déchet (720) ; contrôle de sortie/élimination `.catch(err => { console.error("Error updating document: ", err); })` (940-942) ; incident mis à jour (1056), créé (1069), supprimé (1092) ; suppression utilisateur `console.error('Error deleting user:', err)` (1404, appelée ligne 1396). Aucun toast/bannière de succès n'existe nulle part. Les seuls retours d'erreur réellement affichés sont loginError (259) et errorMsg de la CRÉATION/ÉDITION d'utilisateur (1381/1432).
- **Impact :** Sur un outil de traçabilité réglementaire ASN, un opérateur qui clique 'Valider l'Élimination', supprime ou édite un déchet/incident et dont la requête échoue (réseau, règle Firestore refusée, quota) ne reçoit AUCUN signal d'échec : il croit l'opération enregistrée. La liste ne se met à jour via onSnapshot qu'en cas de succès, donc l'échec n'est détectable qu'en relisant le tableau. Risque direct de perte de traçabilité, double-saisie, ou déchet considéré à tort comme éliminé. C'est le défaut UX le plus dangereux de l'application.
- **Correctif :** Introduire un système de notification (toast/bannière) déclenché dans chaque `.then()` (succès) et `.catch()` (échec) des mutations : 'Enregistrement réussi' / 'Échec : <message lisible>'. Réutiliser/généraliser le pattern errorMsg déjà présent dans UsersView. Coupler avec le verrouillage du bouton pendant la requête (UX-02). Ne jamais laisser une mutation de sûreté se résoudre uniquement en console.
- **Vérification :** CONFIRMÉ et maintenu P0. Toutes les lignes de catch silencieux citées sont exactes (j'ai corrigé 936-942 -> 940-942 pour pointer le bloc catch exact). Nuance factuelle : la formulation 'quasiment TOUTES' est légèrement excessive — UsersView.handleSubmit (création/édition d'utilisateur) affiche bien errorMsg (1381), et DecroissanceView gère l'erreur en relâchant isUpdating (840). Mais cela n'atténue pas la gravité : les mutations cœur de métier (déchet, incident, élimination, suppressions) restent toutes silencieuses, ET aucune confirmation de succès n'existe pour aucune mutation. La criticité réglementaire (sûreté/traçabilité) justifie pleinement P0.

## P1 — Élevé

### [A11Y-01] Thème clair via filter:invert(1) : contraste cassé, couleurs sémantiques inversées, graphiques illisibles

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/globals.css — l.globals.css:3-6 ; appliqué à page.tsx:320`
- **Problème :** Le thème clair est implémenté par `.light-theme { filter: invert(1) hue-rotate(180deg) brightness(1.2); background: white; }` (globals.css 3-6), classe appliquée au conteneur racine de l'app authentifiée (page.tsx:320, `theme === 'light' ? 'light-theme' : ...`). Ce filtre inverse tout le sous-arbre, y compris les graphiques recharts (PieChart/BarChart 533-558) dont les couleurs sont codées en dur (Cell fill via COLORS, Bar fill #FACC15 ligne 556, contentStyle backgroundColor #0D0E12 lignes 540/555) et les badges de statut couleur (vert 'Libérable' 586/999, bleu 'En Stockage' 793, rouge incident 1137). En mode clair, le jaune d'alerte vire au bleu et le rouge 'non conforme' au cyan : le code couleur de sûreté perd son sens. Aucune palette claire dédiée n'existe ; toutes les couleurs restent codées pour le sombre.
- **Impact :** Le 'mode clair' produit une interface aux couleurs faussées où le code couleur réglementaire (rouge=danger/incident, vert=libérable, jaune=alerte) est inversé, et le contraste n'est pas maîtrisé (non conforme WCAG 1.4.3). Pour un outil de radioprotection où la couleur véhicule un état de sûreté, c'est trompeur. Les graphiques deviennent illisibles/décoratifs.
- **Correctif :** Supprimer le filtre invert. Implémenter un vrai thème clair via variables CSS (tokens de couleur) ou variantes Tailwind conditionnelles, avec une palette claire dédiée respectant un ratio >= 4.5:1 pour le texte. Définir explicitement les couleurs recharts selon le thème. Tant que ce n'est pas fait, retirer le bouton de bascule (340-343) plutôt que de livrer un mode clair trompeur.
- **Vérification :** CONFIRMÉ, maintenu P1. Le CSS (globals.css:4) et l'application conditionnelle (page.tsx:320) sont exacts. Les couleurs recharts codées en dur (#FACC15 ligne 556, #0D0E12 lignes 540/555) et les badges sémantiques sont confirmés. P1 approprié : ce n'est pas une faille de sécurité mais c'est trompeur sur un outil de sûreté et non conforme WCAG ; un bouton actif livre cette régression à l'utilisateur.

### [A11Y-02] Aucun attribut d'accessibilité dans toute l'application (aria-label, role, alt, gestion clavier)

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.324-329, 339-344, 346-354, 957, 797-802, 1141-1146, 1473-1480`
- **Problème :** Une recherche sur tout le dossier app (aria-|role=|alt=|sr-only|tabIndex|onKeyDown|onKeyUp|onKeyPress) ne retourne AUCUNE occurrence (vérifié, 0 match). Conséquences : (1) boutons icône-seuls sans nom accessible : toggle menu mobile (324-329, Menu/X), toggle thème (339-344, Sun/Moon), cloche notifications (346-354, Bell). (2) Boutons Modifier/Supprimer des tableaux n'ont qu'un attribut `title=` (797 'Modifier', 800 'Supprimer', 1141, 1144, 1473, 1477) — title n'est pas un nom accessible fiable. (3) Bouton de fermeture de modale = caractère '✕' textuel sans label (957). (4) Logo '☢' (330) est du texte décoratif sans alternative ni aria-hidden.
- **Impact :** Un utilisateur de lecteur d'écran entend 'bouton' sans connaître l'action (changer de thème ? supprimer un déchet ?). Pour une appli hospitalière professionnelle soumise au RGAA/WCAG 2.1 AA (critères 4.1.2 Nom/Rôle/Valeur et 1.1.1), c'est non conforme. La suppression d'un déchet via un bouton non labellisé est particulièrement risquée.
- **Correctif :** Ajouter `aria-label` explicite sur tous les boutons icône-seuls ('Supprimer le déchet', 'Modifier', 'Changer de thème', 'Ouvrir le menu', 'Notifications'). Remplacer/compléter `title` par `aria-label`. Donner `aria-label='Fermer'` au bouton ✕. Marquer les icônes décoratives `aria-hidden='true'`.
- **Vérification :** CONFIRMÉ, maintenu P1. Le grep global sur app/ ne renvoie strictement aucun attribut d'accessibilité — preuve directe. Toutes les lignes citées sont exactes (j'ai élargi 797-801 -> 797-802, 339-343 -> 339-344, 1473-1478 -> 1473-1480, 1141-1145 -> 1141-1146 pour englober les balises de fermeture). P1 justifié : conformité légale RGAA/WCAG AA pour un outil pro hospitalier.

### [A11Y-03] Modales sans gestion du focus ni fermeture clavier (Escape / focus trap)

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.949-975 (modale Sortie), 355-369 (popover Notifications), 386-391 (overlay menu mobile)`
- **Problème :** La modale 'Contrôle avant Sortie' (949-975) est un simple `<div className="absolute inset-0 z-50 ...">` (950) contenant une carte, sans role='dialog'/aria-modal, sans focus auto à l'ouverture, sans focus trap, sans fermeture par Escape (aucun onKeyDown dans tout le fichier — confirmé par grep). Fermeture uniquement via le ✕ (957) ou 'Annuler' (969). Le clic sur l'arrière-plan ne ferme PAS la modale : l'overlay (950) n'a pas de onClick, contrairement au menu mobile (387-390) qui se ferme au clic extérieur. Le popover Notifications (355) et le menu mobile (386) se ferment au clic extérieur mais pas au clavier.
- **Impact :** Un utilisateur clavier peut voir le focus sortir de la modale vers le contenu derrière, et ne peut pas fermer avec Escape comme attendu. Non conforme WCAG 2.1.2 (No keyboard trap) / 2.4.3 (Focus order). Sur un écran de validation d'élimination, l'ergonomie clavier est importante pour la saisie rapide et la sécurité de l'action.
- **Correctif :** Implémenter une modale accessible : role='dialog' aria-modal='true', focus initial sur le premier champ, focus trap, fermeture sur Escape, restitution du focus au déclencheur à la fermeture. Envisager un composant headless accessible (Radix Dialog) plutôt qu'un div manuel.
- **Vérification :** CONFIRMÉ, maintenu P1. Vérifié : la modale (949-975) est un div sans aucun attribut a11y, et le grep onKeyDown=0 sur tout app/ prouve l'absence de gestion Escape. Précision confirmée et exacte : l'overlay de la modale (950) n'a effectivement pas de onClick (≠ menu mobile 387-390 qui en a un), donc le clic sur l'arrière-plan ne ferme pas la modale. P1 cohérent avec A11Y-02 (même périmètre WCAG).

### [ARCH-01] Monolithe client unique de 1725 lignes mêlant UI, auth, CRUD, calculs et rapports

- **Localisation :** ``
- **Problème :** Tout le logiciel vit dans un seul fichier 'use client' (1725 lignes confirmées par wc -l). Le composant racine NuclearWasteApp (l.33-485) gère simultanément: machine à états de navigation (l.34), abonnements Firestore temps réel (l.57-142), bootstrap de l'admin (l.73-91), métriques (l.145-166), journalisation (l.168-179), écran de login avec création de compte (l.192-289). Suivent dans le MÊME fichier 9 vues métier (DashboardView l.491, IdentificationView l.618, DecroissanceView l.815, SortieView l.907, IncidentsView l.1023, ReportsView l.1173, UsersView l.1318, SettingsView l.1493, HelpView l.1605), 3 composants d'impression (PrintRegistre l.1208, PrintInventaire l.1249, PrintMensuel l.1284), 5 composants UI (NavButton l.1659, KPICard l.1678, FormInput l.1690, FormSelect l.1699, ReportCard l.1711) et 3 fonctions de calcul radiophysique (calculateResidual l.598, calculateDecayPercentage l.604, getTheoreticalReleaseDate l.611). app/ ne contient que layout.tsx + page.tsx + globals.css; aucun dossier components/.
- **Impact :** Aucune séparation des préoccupations: impossible de tester unitairement un calcul ou une vue, revue de code difficile, conflits de merge systématiques, couplage fort entre présentation et accès données. Sur une appli réglementée, l'impossibilité d'isoler/tester les calculs de décroissance et la traçabilité est un risque de sûreté direct.
- **Correctif :** Découper en arborescence: app/(routes) par module (segmentation App Router ou onglets en composants dédiés), components/ pour le présentationnel (forms, tables, KPI), features/<module>/ pour la logique de vue, lib/services pour l'accès données. Extraire les calculs radiophysiques dans lib/physics/decay.ts (pur, testable). Viser des fichiers < 300 lignes.
- **Vérification :** CONFIRMÉ. wc -l = 1725 exactement. 'use client' l.1 vérifié. NuclearWasteApp racine l.33 contient bien navigation (l.34), 5 onSnapshot Firestore (l.94/100/106/115), bootstrap admin (l.73-91), métriques useMemo (l.145), logAction (l.168), login+createUser (l.192-229). Toutes les vues, composants Print et UI sont dans le même fichier. Légère imprécision de l'audit: il y a 5 composants UI (pas 4) et 9 vues (HelpView non comptée), mais cela renforce le constat. Sévérité P1 maintenue: pour une appli réglementée non testable, l'altitude est justifiée (pas P0 car pas un bug runtime, mais risque structurel majeur).

### [ARCH-02] Absence totale de couche service/repository d'accès aux données

- **Localisation :** ``
- **Problème :** Les appels Firestore sont écrits inline dans les handlers UI de chaque vue. Exemples vérifiés: création/édition de déchet directement dans handleSubmit (l.647-686), suppression + cascade incidents (l.708-723), batch de libération (l.831-842), contrôle de sortie (l.934-944), CRUD incidents (l.1046-1094), CRUD utilisateurs avec createUserWithEmailAndPassword (l.1342-1383), restore qui réécrit la base document par document (l.1524-1534). La logique de requête (query/where hospitalId 'default-hospital') est dupliquée dans chaque onSnapshot (l.93, 99, 105, 114).
- **Impact :** Aucun point unique pour valider les données, gérer les erreurs, appliquer les permissions ou logguer. Toute évolution du schéma ou de la collection oblige à modifier des dizaines d'emplacements. La logique métier critique (transition de statut, calcul de seuil) n'est pas isolable ni auditable, ce qui contredit l'exigence de traçabilité réglementaire.
- **Correctif :** Introduire un module lib/repositories (wasteRepository, incidentRepository, userRepository, logRepository) exposant des fonctions typées (listByHospital, create, update, remove, releaseBatch...). Les vues n'appellent que ces fonctions; la validation, le logging d'audit et la gestion d'erreur y sont centralisés.
- **Vérification :** CONFIRMÉ. Toutes les lignes citées vérifiées au texte: setDoc/updateDoc inline l.650/683, deleteDoc + cascade getDocs l.711-718, writeBatch l.833-837, updateDoc sortie l.936, CRUD incidents l.1049/1069/1092, createUserWithEmailAndPassword l.1361 + setDoc l.1374, restore boucle setDoc l.1528-1530. hospital'default-hospital' codé en dur et dupliqué dans les 5 onSnapshot et chaque création. Aucun fichier de repository/service n'existe (lib/ = data.ts, firebase.ts, utils.ts uniquement). Sévérité P1 maintenue.

### [ARCH-04] Usage massif de ': any' / 'as any' annulant TypeScript (68 occurrences)

- **Localisation :** ``
- **Problème :** Comptage vérifié: 68 occurrences du motif ': any' / '<any' / 'as any' (dont 9 'as any'). Tous les composants de vue ont des props non typées: DashboardView(...: any) l.491, IdentificationView l.618, DecroissanceView l.815, SortieView l.907, IncidentsView l.1023, ReportsView l.1173, UsersView l.1318, SettingsView l.1493, et tous les helpers UI (NavButton l.1659, KPICard l.1678, FormInput l.1690, FormSelect l.1699, ReportCard l.1711). États non typés: actionLogs useState<any[]> (l.38), authUser useState<any>(null) (l.42), unsub* en any (l.58-62). Les fonctions de calcul prennent (w: any) (l.598, 604, 611). Casts dangereux: role: 'Administrateur' as any (l.82), type/radionuclide as any (l.653-654, 670-671, 1051, 1063, 1349, 1368) qui contournent les unions WasteType/Radionuclide/UserRole pourtant définies dans types.ts.
- **Impact :** Le bénéfice principal de TypeScript (détection des erreurs de structure de données) est neutralisé. Les types WasteItem/Incident/User de types.ts ne protègent quasiment rien à l'usage. Sur une appli où une faute de champ peut fausser un calcul de seuil de libération ou une entrée de registre réglementaire, l'absence de typage effectif est un risque d'intégrité des données.
- **Correctif :** Typer les props de chaque vue avec des interfaces dédiées (ex: { wasteItems: WasteItem[]; logAction: (s: string) => void }), typer les états (authUser: FirebaseUser | null, actionLogs: ActionLog[], unsub: Unsubscribe), supprimer les 'as any' en faisant transiter les valeurs de formulaire par des parseurs validants. Activer eslint @typescript-eslint/no-explicit-any.
- **Vérification :** CONFIRMÉ avec précision: le motif ': any'/'<any'/'as any' donne exactement 68 occurrences (le grep brut sur 'any' en donne 69 car il inclut une sous-chaîne non pertinente). Toutes les props de vues et helpers UI sont bien ': any'. États any l.38/42/58-62 vérifiés. Calculs (w: any) l.598/604/611 vérifiés. Casts 'as any' sur des champs typés en union (type, radionuclide, role) vérifiés l.82, 653-654, 670-671, 1051, 1063, 1349, 1368. Sévérité P1 maintenue: le typage est défini dans types.ts mais systématiquement contourné, neutralisant la garde-fou sur des données réglementaires.

### [ARCH-05] Gestion d'erreurs réduite à console.error sans retour utilisateur

- **Localisation :** ``
- **Problème :** Comptage vérifié: 16 console.error. Les écritures critiques avalent l'erreur silencieusement: création/MAJ déchet .catch(err => console.error(err)) (l.661, 683), suppression (l.720), batch de libération (l.840), contrôle de sortie (l.941), CRUD incidents (l.1056, 1069, 1092), suppression user (l.1404), logAction lui-même (l.176). Les erreurs des onSnapshot temps réel sont aussi seulement loguées (l.97, 103, 112, 118). Le restore (l.1538-1540) attrape l'erreur de parsing JSON mais PAS les échecs setDoc individuels dans la boucle for...await (l.1528-1530): un setDoc rejeté interrompt la boucle sans rapport ni feedback fiable, laissant la restauration partielle.
- **Impact :** Un échec d'écriture (règle Firestore refusée, réseau, quota) ne produit AUCUN feedback dans la plupart des cas: l'utilisateur croit l'action réussie alors qu'un déchet n'a pas changé de statut, qu'un incident n'a pas été enregistré, ou qu'une sauvegarde n'a été que partiellement restaurée. Pour un registre réglementaire, une écriture silencieusement perdue est une non-conformité et un risque de perte de traçabilité. Nuance: UsersView remonte bien errorMsg à l'écran (l.1379-1381), c'est la seule exception.
- **Correctif :** Centraliser la gestion d'erreur dans la couche repository, remonter une notification visible (toast/bannière) sur succès ET échec dans TOUTES les vues (généraliser le pattern errorMsg déjà présent dans UsersView), traiter le restore en transaction/batch (writeBatch) avec rollback ou rapport d'échec par item, et journaliser côté serveur. Distinguer erreurs récupérables vs critiques.
- **Vérification :** CONFIRMÉ. 16 console.error vérifiés au comptage. Tous les .catch listés avalent l'erreur sans feedback UI: l.661/683 (déchet), 720 (delete), 840 (batch), 941 (sortie), 1056/1069/1092 (incidents), 1404 (user delete), 176 (log), 97/103/112/118 (snapshots). Restore l.1528-1530: la boucle for...of avec await setDoc n'a pas de try/catch interne — seul le parse JSON est protégé (l.1521-1539), donc un échec d'écriture stoppe la restauration et n'est PAS reporté. Une seule exception au constat: handleSubmit de UsersView (l.1379-1381) affiche bien errorMsg à l'utilisateur, ce que l'audit ne mentionne pas — corrigé dans impact. Sévérité P1 maintenue.

### [ARCH-08] Absence totale de tests automatisés

- **Localisation :** ``
- **Problème :** Aucun fichier de test dans le dépôt (find sur *.test.* et *.spec.* = aucun résultat). package.json ne déclare aucun script de test (scripts l.5-11: dev, build, start, lint, clean uniquement) ni framework (pas de jest/vitest/@testing-library dans dependencies l.12-27 ni devDependencies l.29-41). Les fonctions de calcul radiophysique critiques calculateResidual (l.598), calculateDecayPercentage (l.604), getTheoreticalReleaseDate (l.611) et la détection de seuil handleCheckThresholds (l.818-846, qui compare residual <= regulatoryClearanceLevel) ne sont couvertes par aucun test.
- **Impact :** Sur une application réglementée dont la finalité est de décider quand un déchet radioactif peut être libéré, l'exactitude des calculs de décroissance n'est ni vérifiée ni protégée contre les régressions. Une erreur dans la formule de décroissance ou la comparaison de seuil pourrait conduire à libérer un déchet encore actif, avec un enjeu de sûreté et de conformité réel. C'est la lacune la plus grave côté qualité.
- **Correctif :** Extraire les calculs en module pur (lib/physics/decay.ts) et ajouter des tests unitaires (vitest) couvrant des valeurs connues par isotope (Tc-99m 6h, F-18 1.83h, I-131 192h), les bornes (hl=0, activité <= seuil) et la transition de statut. Ajouter des tests d'intégration sur les repositories avec l'émulateur Firebase. Documenter la validation métrologique.
- **Vérification :** CONFIRMÉ. Aucun *.test.*/*.spec.* dans le repo. package.json: scripts l.5-11 sans test, aucune dépendance de test (vérifié dans les 2 blocs de deps). Les 3 fonctions de calcul (l.598/604/611) et handleCheckThresholds (l.818-846 avec residual <= regulatoryClearanceLevel l.824) sont non testées et non isolées (elles vivent dans page.tsx, prenant w: any). Sévérité P1 maintenue: pour un calcul de libération de déchet radioactif non testé, l'altitude est pleinement justifiée.

### [DATA-04] Guard de suppression utilisateur compare un UID Firebase à un email : protection de l'admin inopérante

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.1396-1397, 1476, 86, 1364-1365`
- **Problème :** Confirmé. handleDelete(id) l.1396 reçoit u.id qui vaut l'UID Firebase Auth (création l.1364-1365 `id: uid`, admin l.86 `setDoc(doc(db, 'users', user.uid), ...)`). La garde l.1397 `if (id === 'agbotonfrejuste@gmail.com') return;` compare donc un UID à une adresse email — condition toujours fausse. Le commentaire l.1397 ('protect master admin if needed, better let's just delete the user doc') confirme la désactivation de fait. Le seul garde effectif est UI : le bouton n'est rendu que si `u.email !== 'agbotonfrejuste@gmail.com'` (l.1476). handleDelete reste appelable et ne re-vérifie rien ; les règles firestore l.60-62 autorisent tout utilisateur signé à supprimer n'importe quel doc users (allow write: if isSignedIn()).
- **Impact :** Protection du compte admin maître reposant uniquement sur le masquage d'un bouton. Le doc admin peut être supprimé par erreur de code/refactor, ou par tout utilisateur authentifié via écriture directe (règles permissives). Sa suppression provoque l'écran 'Accès Non Autorisé' (l.296-317) pour l'admin et la perte de gestion des utilisateurs. Note atténuante : l'admin est recréé automatiquement à la prochaine connexion (l.73-90 : si le doc admin n'existe pas, il est reconstruit via setDoc), donc la perte est récupérable par re-login de l'admin, mais avec permissions par défaut et perte de l'état précédent.
- **Correctif :** Comparer sur le bon champ : tester u.email === 'agbotonfrejuste@gmail.com' à l'intérieur de handleDelete (passer l'objet user ou le retrouver par id). Idéalement, ne pas coder l'admin en dur côté client et faire respecter l'invariant par les règles Firestore (interdire la suppression du doc users dont email == admin, ou via un rôle protégé). Durcir aussi les règles users qui autorisent actuellement toute suppression à un signed-in.
- **Vérification :** CONFIRMÉ par lecture de page.tsx (l.1396-1406 handleDelete, l.86 id admin = uid, l.1364-1365 id user = uid, l.1476 garde UI) et firestore.rules (l.60-62 : write si isSignedIn()). La comparaison UID vs email est bien toujours fausse. P1 maintenu : la garde de code est inopérante et les règles sont permissives, mais la recréation automatique de l'admin au login (l.73-90) atténue la criticité (ce n'est pas une perte définitive de l'accès admin). P1 reste justifié — la protection annoncée n'existe pas et un utilisateur non-admin peut supprimer n'importe quel profil. Pas P0 car récupérable.

### [DATA-07] Number(...)||defaut et valeurs par défaut radiophysiques silencieuses : saisies invalides converties en données fausses (halfLife=6h, doseRateBefore=NaN)

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.655-660, 672-677, 1052-1066, 598-616, 1155`
- **Problème :** Confirmé avec une nuance sur le sous-cas Invalid Date. Coercions silencieuses à la création/édition déchet : `initialActivity: Number(formData.initialActivity) || 0` (l.655/672), `halfLife: Number(formData.halfLife) || 6` (l.659/676), `regulatoryClearanceLevel: Number(...) || 0.1` (l.660/677), `doseRate1m: Number(...) || ((Number(doseRateContact)||0)/10)` (l.658/675). Conséquences vérifiées : (1) halfLife par défaut 6h appliqué à TOUT déchet dont la demi-vie est mal saisie ou vide — fausse complètement la décroissance d'un I-131 (~192h) ou Lu-177 (~159h), donc une date de libération trop précoce (getTheoreticalReleaseDate l.611-616 et calculateResidual l.598-601 utilisent halfLife). (2) initialActivity=0 : dans getTheoreticalReleaseDate l.612 la condition `w.initialActivity <= w.regulatoryClearanceLevel` (0 <= 0.1) est vraie et renvoie la date de mesure comme date de libération → déchet déclaré immédiatement libérable. Côté incidents, `Number(formData.doseRateBefore)` (l.1052/1064) et doseRateAfter SANS || produisent NaN si vide, stocké tel quel et affiché 'NaN µSv/h' (l.1155/1163). CORRECTION de l'audit : le sous-cas 'log(Infinity)=Infinity → Invalid Date' n'est PAS atteignable quand initialActivity=0, car la garde l.612 (0 <= 0.1) court-circuite AVANT le calcul l.613. L'Invalid Date supposée par division par zéro ne se produit pas dans ce scénario précis. Le reste du constat (libération à tort, halfLife par défaut, NaN incidents) est exact. Atténuation partielle : les inputs sont required (l.748, 750, 751, 1117, 1118) et type=number, ce qui empêche la soumission d'un champ totalement vide via la validation HTML native (mais pas une valeur non numérique collée, ni la coercition ||defaut qui reste un masquage d'erreur dangereux).
- **Impact :** Sur appli de sûreté radiologique, des données radiophysiques erronées sont silencieusement persistées : déchet déclaré 'libérable' à tort (activité=0), ou date de libération calculée sur une demi-vie de 6h au lieu de la vraie valeur → risque de libérer un déchet encore actif. Affichage 'NaN µSv/h' dans les rapports d'incident. Risque de sûreté, non cosmétique.
- **Correctif :** Valider strictement avant écriture : rejeter et signaler toute valeur non numérique, négative ou nulle pour initialActivity, halfLife, regulatoryClearanceLevel. Ne JAMAIS substituer une demi-vie par défaut (6h) silencieuse. Bloquer la soumission si halfLife<=0 ou initialActivity<=0. Garder getTheoreticalReleaseDate contre initialActivity<=0 et regulatoryClearanceLevel<=0. Valider doseRateBefore/After (pas de NaN persisté). Idéalement pré-remplir halfLife depuis une table de référence par radionucléide.
- **Vérification :** CONFIRMÉ pour l'essentiel par lecture de page.tsx l.655-660, 672-677 (déchets), 1052-1066 (incidents), 598-616 (calculs). NUANCE/CORRECTION apportée : l'audit prétend que initialActivity=0 ou absent provoque log(Infinity)=Infinity → Invalid Date dans getTheoreticalReleaseDate. C'est FAUX pour initialActivity=0 : la garde l.612 `w.initialActivity <= w.regulatoryClearanceLevel` (0 <= 0.1) renvoie la date de mesure avant d'atteindre la division l.613. J'ai donc rectifié la description. Le cœur du constat (halfLife=6h par défaut faussant la décroissance, initialActivity=0 → libérable à tort, NaN doseRate incidents persisté/affiché l.1155) est bien réel et reproductible. P1 maintenu : risque de sûreté radiologique direct via données fausses silencieuses, mais nécessite une saisie erronée de l'opérateur et les champs required HTML réduisent les cas de champ vide. Pas P0 car non automatique/systématique. Sévérité appropriée.

### [REG-04] Affirmations de conformité et indicateurs inventés (footer figé) sur une appli se présentant comme conforme ASN

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.475-482 (footer)`
- **Problème :** Le pied de page affiche en dur (l.476-480) : 'Conformité ASN/AFNOR: Active-2023.v4', 'Capacité de stockage: 78.4%', 'Capteurs: Actifs' et 'Heure locale: 14:48:12'. Aucune valeur n'est calculée : pas de référentiel de version de conformité, pas de mesure de capacité (aucun champ volume/capacité dans le modèle), pas de capteur, et l'heure est une chaîne statique qui n'avance pas. La mention 'Active-2023.v4' suggère faussement une validation réglementaire en vigueur.
- **Impact :** Affirmation de conformité trompeuse sur un dispositif réglementé : induit l'utilisateur et un éventuel auditeur en erreur sur l'état réel de conformité et de surveillance. 'Capteurs: Actifs' et 'Capacité 78.4%' donnent une fausse assurance opérationnelle.
- **Correctif :** Supprimer toute mention de conformité non étayée ou la remplacer par un texte vérifiable et daté. Calculer réellement la capacité (si pertinent) ou retirer l'indicateur ; retirer 'Capteurs: Actifs' faute de capteurs ; afficher une horloge dynamique ou rien. Ne revendiquer une conformité qu'après validation documentée par un organisme/PCR.
- **Vérification :** CONFIRMÉ : l.476-480 affichent exactement ces chaînes statiques. L'heure '14:48:12' est codée en dur (jamais réactualisée). Aucun champ capacité/volume dans types.ts (vérifié). Sévérité P1 cohérente : c'est trompeur et engage la responsabilité, mais sans effet de calcul direct sur la classification d'un déchet (pas P0). Maintenue P1.

### [REG-05] Le contrôle de sortie n'impose aucun seuil sur le débit de dose mesuré ni cohérence avec l'activité résiduelle

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.919-945 (handleControlSubmit), 961-962 (champs)`
- **Problème :** handleControlSubmit (l.919-945) construit updatedData avec `status: 'elimine'` (l.924), exitDoseRate = Number(controlData.exitDoseRate) (l.926) et exitConformity = controlData.exitConformity === 'Oui' (l.927), tous deux saisis manuellement (l.961-962), puis fait updateDoc sans AUCUNE vérification automatique. On peut valider l'élimination avec exitConformity='Oui' alors que exitDoseRate dépasse le fond, ou que l'activité résiduelle calculée reste > seuil. Le placeholder '< 0.1' (l.961) est purement indicatif et jamais contrôlé.
- **Impact :** Un déchet peut être marqué 'éliminé / conforme' sans contrôle réel : la barrière de sécurité finale avant sortie de zone est purement déclarative. Risque d'élimination de matière au-dessus des seuils.
- **Correctif :** À la validation, recalculer l'activité (massique) résiduelle et comparer exitDoseRate à un seuil paramétrable (ex. bruit de fond x facteur). Bloquer ou exiger une double validation (PCR) si débit/activité dépassent les seuils ; interdire exitConformity='Oui' incohérent avec les mesures.
- **Vérification :** CONFIRMÉ : handleControlSubmit (l.919-945) ne fait aucun test de seuil ni de cohérence avant `status: 'elimine'`. exitConformity dérive uniquement de la saisie 'Oui'/'Non' (l.927/962). Placeholder l.961 décoratif. Sévérité P1 maintenue (contrôle déclaratif) — pourrait être considéré P0 au même titre que REG-01 puisque c'est aussi une barrière de sortie, mais comme l'élimination passe en pratique par le passage 'liberable' (REG-01 déjà P0) et qu'ici l'opérateur déclare au moins une mesure, je laisse P1.

### [REG-07] Champs réglementaires manquants dans le modèle de données (masse/volume, nombre de périodes cible, signature, n° d'autorisation, bordereau d'élimination)

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/types.ts — l.5-37 (WasteItem), 41-51 (Incident), app/page.tsx 680 (expectedDecayDuration), 1208-1247 (PrintRegistre)`
- **Problème :** WasteItem (types.ts l.5-37) ne contient ni masse/volume du colis (indispensable pour l'activité massique Bq/g), ni nombre de périodes visé, ni identifiant de bordereau de suivi d'élimination, ni n° d'autorisation/agrément de la filière, ni signature électronique vérifiable du contrôleur. expectedDecayDuration est en jours (l.25) mais fixé en dur à 10 (page.tsx l.680) sans lien avec la demi-vie. Incident (l.41-51) ne porte ni gravité/classification, ni notification ASN, ni identité authentifiée du déclarant (personnelFunction est juste un nom choisi dans une liste, page.tsx l.1115). PrintRegistre (l.1208-1247) ne comporte qu'une ligne 'Signature Responsable de la Radioprotection :' manuscrite (l.1243), sans traçabilité numérique.
- **Impact :** Le registre généré est incomplet au regard d'un registre réglementaire de déchets radioactifs : impossible de justifier l'activité massique, le respect des 10 périodes, la filière agréée ou la déclaration d'incident. Incomplétude documentaire plutôt que faux calcul.
- **Correctif :** Ajouter au modèle : masse/volume, niveau de libération en Bq/g par isotope, périodes écoulées calculées, n° de bordereau et d'agrément de la filière, signataire authentifié + horodatage serveur. Lier expectedDecayDuration à >=10·T½ au lieu de la constante 10. Compléter Incident (gravité, déclaration ASN, déclarant authentifié).
- **Vérification :** CONFIRMÉ : types.ts l.5-37 (WasteItem) et l.41-51 (Incident) ne contiennent aucun des champs cités. expectedDecayDuration: 10 en dur vérifié page.tsx l.680. personnelFunction est bien une simple sélection de nom (FormSelect options=userOptions, l.1115). PrintRegistre l.1243 = signature manuscrite uniquement. Sévérité P1 maintenue (incomplétude documentaire, pas d'erreur de calcul direct).

### [REG-08] Restauration de sauvegarde JSON sans validation : écrasement direct des données réglementaires depuis un fichier arbitraire

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.1513-1543 (handleRestore), 1496-1511 (handleBackup)`
- **Problème :** handleRestore (l.1513-1543) lit un JSON local et, après le seul test d'existence des trois tableaux (l.1523), fait `setDoc` en boucle sur wasteItems, incidents et users (l.1528-1530) sans aucune validation de schéma, ni de bornes physiques (activité>=0, halfLife>0, statut dans l'énumération), ni vérification d'intégrité. Un fichier modifié à la main peut donc réécrire tout le registre (activités, statuts, dates, rôles utilisateurs) en contournant la logique métier et les logs (un seul log global est écrit, l.1531, pas par item). handleBackup (l.1496-1511) exporte aussi les données utilisateurs en clair côté navigateur. Aucune restriction de rôle : les permissions définies (l.1338-1340) ne sont jamais vérifiées pour autoriser la restauration.
- **Impact :** Vecteur de falsification du registre réglementaire : antidater des éliminations, remettre des déchets 'éliminés' en 'libérable', ou s'attribuer le rôle Administrateur, sans trace fiable. Atteinte à l'intégrité des données réglementées.
- **Correctif :** Valider chaque enregistrement restauré contre le schéma et des bornes physiques (activité>=0, halfLife>0, statut dans l'énumération), journaliser chaque écrasement avec horodatage serveur, restreindre la restauration au rôle Administrateur (permissions actuellement non appliquées), et idéalement signer les sauvegardes pour détecter toute altération.
- **Vérification :** CONFIRMÉ : handleRestore l.1523 ne teste que data.wasteItems && data.incidents && data.users, puis setDoc brut l.1528-1530. Aucun appel de validation côté client, et côté Firestore les règles n'appliquent pas non plus les fonctions isValidWasteItem/isValidIncident/isValidUser (wasteItems/incidents/users sont en `allow read, write: if isSignedIn()` — rules l.52-62). Permissions définies l.1338-1340 mais jamais consultées comme garde. backup exporte users (l.1500). Sévérité P1 maintenue (vecteur d'intégrité réel mais nécessitant accès à l'UI/compte authentifié).

### [SEC-02] Fonctions de validation isValidWasteItem/isValidIncident/isValidUser définies mais jamais appliquées

- **Localisation :** `firestore.rules — l.12-50 (définies), 52-66 (non référencées)`
- **Problème :** Confirmé. Les fonctions isValidId (12-14), incoming() (16-18), existing() (20-22), isValidWasteItem (24-32), isValidIncident (34-42) et isValidUser (44-50) sont déclarées mais ne sont référencées dans AUCUN bloc match. Les conditions d'écriture (53, 57, 61, 65) appellent uniquement isSignedIn(). Ces fonctions sont du code mort donnant une fausse impression de robustesse. NB : l'audit donnait la plage '24-50' ; la première fonction inutilisée commence en réalité dès isValidId (12) et incoming/existing (16-22) — corrigé.
- **Impact :** Aucune validation de structure, de type ni de cohérence des données n'est imposée côté serveur. Un compte authentifié peut écrire des documents arbitraires : champs manquants, types incorrects, hospitalId falsifié, payloads volumineux. Couplé à SEC-01, absence totale de garde-fou d'intégrité sur des données réglementaires.
- **Correctif :** Brancher réellement ces fonctions dans des règles granulaires, ex. `allow create: if isSignedIn() && isValidWasteItem(incoming()) && incoming().hospitalId == request.auth.token.hospitalId;` et `allow update: if ... && isValidWasteItem(incoming());`. Ajouter la validation des champs sensibles (status dans une énumération fermée, immuabilité de id et createdAt, hospitalId == celui de l'utilisateur).
- **Vérification :** PREUVE : lecture intégrale de firestore.rules. Les fonctions existent (12-50) mais aucune occurrence dans les blocs match (53/57/61/65). Sévérité ABAISSÉE de P0 à P1 : il s'agit d'un défaut de validation/intégrité, conséquence de SEC-01 (déjà coté P0) ; isolé, c'est un défaut sérieux d'intégrité de données mais pas une faille d'autorisation supplémentaire distincte. Constat techniquement exact.

### [SEC-06] Auto-création du compte administrateur sur email codé en dur

- **Localisation :** `app/page.tsx + lib/firebase.ts — l.app/page.tsx:73-91, 203-214 ; lib/firebase.ts:2`
- **Problème :** Confirmé, deux mécanismes. (1) À la connexion (page.tsx 199-214) : emailTrimmed est comparé à l'email codé en dur 'agbotonfrejuste@gmail.com' (ligne 203) ; si le sign-in échoue et que l'email correspond, l'app appelle createUserWithEmailAndPassword (ligne 207) — la première personne à 'se connecter' avec cet email choisit le mot de passe et crée le compte Auth. (2) Dans onAuthStateChanged (page.tsx 73-91) : dès que user.email vaut cet email (73), si le doc n'existe pas (76), un document users avec role 'Administrateur' et permissions ['admin_complet'] est créé automatiquement via setDoc (86-87), sans validation serveur. L'email est aussi présent dans le code (page.tsx 73, 203, 1397, 1476). lib/firebase.ts:2 importe bien createUserWithEmailAndPassword comme indiqué.
- **Impact :** L'email super-admin est committé dans le code source. Tant que ce compte Auth n'a pas été créé sur le projet Firebase, n'importe qui le revendique en fixant son mot de passe (vecteur 1), puis obtient automatiquement role Administrateur/admin_complet (vecteur 2), prenant le contrôle total. Le bootstrap admin dépend d'une donnée client (user.email) et non d'un mécanisme serveur de confiance.
- **Correctif :** Supprimer le bootstrap admin côté client (vecteurs 1 et 2). Provisionner le compte admin une seule fois via la console Firebase / Admin SDK et attribuer le rôle via custom claim. Ne jamais coder en dur une identité privilégiée dans le code client ni auto-créer un compte privilégié sur simple présentation d'un email.
- **Vérification :** PREUVE : page.tsx 203-214 (création Auth si email admin et sign-in échoué), page.tsx 73-91 (auto-création doc users role Administrateur permissions ['admin_complet'], setDoc 86-87), lib/firebase.ts:2 (import createUserWithEmailAndPassword). Sévérité P1 maintenue : exploitabilité conditionnée à ce que le compte Auth ne soit pas déjà créé ; si déjà créé, le vecteur 1 échoue (auth/email-already-in-use, géré ligne 209). Risque réel mais fenêtre/condition spécifique => P1, pas P0.

### [SEC-08] Fonction restore : écriture en masse de JSON arbitraire dans Firestore sans contrôle

- **Localisation :** `app/page.tsx — l.1513-1543`
- **Problème :** Confirmé. handleRestore (page.tsx 1513-1543) lit un fichier JSON fourni par l'utilisateur (FileReader 1519-1522) et, si les clés wasteItems/incidents/users existent (1523), itère et exécute setDoc(doc(db,'wasteItems',item.id), item) (1528), idem incidents (1529) et users (1530) — en écrivant les objets bruts tels quels, SANS validation de schéma, de types, de hospitalId, ni contrôle de rôle. Aucune sauvegarde préalable ni confirmation. Le commentaire 1526-1527 dit explicitement 'For safety we'll just overwrite.'
- **Impact :** Tout utilisateur accédant à l'onglet Paramètres (donc tout le monde, cf. SEC-05) peut écraser massivement la base avec des données arbitraires : faux enregistrements de déchets, falsification du registre, création d'utilisateurs avec permissions ['admin_complet'] (re-escalade via SEC-03), corruption des statuts. Vecteur direct d'altération de données et d'escalade de privilèges sur une base réglementée.
- **Correctif :** Restreindre la restauration aux administrateurs (UI + règles serveur). Valider chaque objet contre le schéma attendu avant écriture (réutiliser isValidWasteItem/etc. dans les règles), forcer hospitalId à celui de l'utilisateur, interdire l'écriture de role/permissions par cette voie, demander une confirmation explicite. Idéalement déléguer à une Cloud Function privilégiée et auditée.
- **Vérification :** PREUVE : lecture page.tsx 1513-1543 (FileReader, parse JSON, boucles setDoc brutes sans validation, commentaire 'just overwrite'). Sévérité P1 maintenue : exploitation crédible (un seul fichier JSON malveillant) mais nécessite l'accès à l'UI Paramètres ; l'écriture serveur arbitraire racine est déjà couverte par SEC-01 (P0). Constat exact.

### [SEC-09] Création de comptes (y compris Administrateur) par tout utilisateur via instance Auth secondaire, sans contrôle serveur du rôle

- **Localisation :** `app/page.tsx + lib/firebase.ts — l.app/page.tsx:1333-1377 (création), 1430 (select rôle) ; lib/firebase.ts:20-22`
- **Problème :** Confirmé. La création d'utilisateurs (UsersView handleSubmit, page.tsx 1354-1377) utilise l'instance Auth secondaire (lib/firebase.ts 20-22, secondaryApp/secondaryAuth) pour appeler createUserWithEmailAndPassword (1361) puis écrit le doc users avec le role/permissions choisis dans le formulaire (1364-1374, role librement sélectionnable y compris 'Administrateur' via FormSelect ligne 1430). Tout est côté client. Comme UsersView est accessible à tout utilisateur (SEC-05) et que /users autorise toute écriture (SEC-01), n'importe quel compte peut créer de nouveaux comptes Administrateur. La possibilité d'auto-inscription publique dépend en outre de la configuration du projet Firebase (non vérifiable dans le code).
- **Impact :** Multiplication non contrôlée de comptes et attribution arbitraire de rôles privilégiés par un utilisateur non-admin. Couplé à l'identité du projet exposée (SEC-07), un tiers peut se ménager un accès. Atteinte au moindre privilège et à la traçabilité.
- **Correctif :** Déplacer la création d'utilisateurs vers une Cloud Function protégée (vérifiant que l'appelant est admin) qui crée le compte Auth et pose le rôle via custom claim ; réserver l'écran de gestion aux admins (SEC-05) ; vérifier dans la console Firebase que l'auto-inscription email/mot de passe est restreinte ; activer App Check.
- **Vérification :** PREUVE : page.tsx 1354-1377 (secondaryAuth + createUserWithEmailAndPassword + setDoc role/permissions), 1430 (FormSelect propose 'Administrateur'), lib/firebase.ts:20-22 (instance secondaire). Sévérité P1 maintenue : vecteur d'escalade/abus réel mais redondant avec SEC-03 (escalade plus directe encore). La partie 'inscription ouverte' reste une hypothèse dépendant de la config Firebase, non prouvable dans le repo — signalé.

### [SEC-10] Journal d'actions (logs d'audit) modifiable et supprimable par tout utilisateur, userEmail falsifiable

- **Localisation :** `firestore.rules + app/page.tsx — l.firestore.rules:64-66 ; app/page.tsx:168-179, 114-118`
- **Problème :** Confirmé. La collection logs sert de piste d'audit (logAction page.tsx 168-179, affichage via actionLogs/SettingsView). La règle (firestore.rules 64-66) est `allow read, write: if isSignedIn();`, ce qui autorise create MAIS AUSSI update et delete arbitraires — les entrées ne sont pas immuables. De plus userEmail est renseigné côté client (page.tsx 174 : `currentUserProfile?.email || 'Système'`) et date côté client (173), donc tous deux falsifiables. Le filtre de lecture par hospitalId (114) est aussi purement client.
- **Impact :** La traçabilité — exigence centrale d'une application réglementée ASN — n'a aucune valeur probante : un utilisateur peut effacer ou réécrire les logs pour masquer une suppression de déchet, une libération frauduleuse ou une escalade de privilèges. La piste d'audit est entièrement maquillable.
- **Correctif :** Rendre les logs append-only dans les règles : `allow create: if isSignedIn() && isValidLog(incoming()); allow update, delete: if false;`. Forcer date (request.time) et userEmail (request.auth.token.email) côté serveur plutôt que de faire confiance au client. Prévoir une rétention et un export inviolable pour la conformité.
- **Vérification :** PREUVE : firestore.rules:64-66 (write libre => update/delete possibles), page.tsx:168-179 (logAction écrit userEmail/date depuis le client), page.tsx:114-118 (lecture filtrée client). Sévérité P1 maintenue : atteinte grave à la traçabilité réglementaire, mais conséquence directe de SEC-01 (P0) appliquée à la collection logs. Constat exact.

### [UX-02] Absence d'état de chargement sur les actions (soumissions, suppressions, restauration)

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.643-689, 708-723, 919-945, 1044-1074, 1089-1095, 1333-1383, 1396-1406, 1513-1543, 1559-1567`
- **Problème :** Aucun verrou d'état 'chargement/désactivé' pendant les requêtes async, sauf DecroissanceView qui gère proprement `isUpdating` (disabled + 'Analyse en cours...', 857-861). IdentificationView.handleSubmit (643) appelle resetForm() de façon synchrone après le import (688) — le bouton submit (757) n'est jamais désactivé. SortieView.handleControlSubmit (919) ferme la modale via setControlItem(null) seulement dans le .then (938) mais le bouton 'Valider l'Élimination' (970) reste cliquable pendant l'attente. IncidentsView.handleSubmit (1044) idem (bouton 1126). UsersView.handleSubmit (1333) await sans désactiver le bouton (1435). Les suppressions handleDelete déchet (708), incident (1089) et user (1396) n'ont aucun verrou. handleRestore (1513) met seulement le texte 'Restauration en cours...' (1517) sans désactiver l'input file (1563) ni le bouton (1564), alors qu'il exécute une boucle de setDoc séquentielle (1528-1530).
- **Impact :** Double-clics → créations/incidents en double ou collisions d'écriture. Sur connexion lente (hôpital), l'utilisateur sans feedback re-clique en pensant que rien ne s'est passé. La restauration (handleRestore) est la plus risquée : boucle await setDoc séquentielle sur potentiellement des centaines d'enregistrements sans aucun verrouillage de l'UI, l'utilisateur peut relancer une restauration ou naviguer en plein milieu.
- **Correctif :** Ajouter un état `isSubmitting`/`isDeleting`/`isRestoring` par action, désactiver le bouton (disabled + opacity) et afficher un libellé 'Enregistrement...' pendant l'attente, en reproduisant le pattern propre déjà appliqué dans DecroissanceView (857-861). Pour handleRestore, désactiver l'input file pendant la boucle.
- **Vérification :** CONFIRMÉ, maintenu P1. Lignes vérifiées et précisées (ajout 1089-1095 suppression incident et 1396-1406 suppression user, 1559-1567 input/bouton de restauration). L'exception DecroissanceView citée par l'audit est exacte. Détail corrigé : l'audit dit que dans IdentificationView le formulaire se ferme dans le .then ; en réalité resetForm() est appelé SYNCHRONIEMENT après le import (688), donc le formulaire se ferme immédiatement même si l'écriture échoue ensuite — ce qui aggrave UX-01 mais ne change pas le constat UX-02 (pas de verrou). Sévérité P1 cohérente.

## P2 — Moyen

### [A11Y-04] Tailles de police sous le seuil de lisibilité (9px / 10px) sur des données réglementaires

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.782, 786, 790, 1007, 1464, 334, 374, 396, 406, 421, 475, 570`
- **Problème :** Usage massif de `text-[9px]` et `text-[10px]` pour des données métier, pas seulement décoratives : opérateur responsable du déchet `text-[9px]` (782), demi-vie `text-[10px]` (786) et date de mesure `text-[10px]` (790), permissions utilisateur `text-[9px]` (1464), détails d'élimination `text-[10px]` (1007), en-têtes de tableau `text-[10px]` (570), indicateurs header (334), identité utilisateur header (374), libellés de navigation/alertes (396, 406, 421), footer `text-[9px]` (475). Le texte est souvent combiné `uppercase` + `tracking-widest`/`tracking-[0.2em]` + parfois `italic`, ce qui réduit encore la lisibilité, sur fond très sombre avec des gris faibles (slate-500/600).
- **Impact :** 9px (~7pt) est sous les recommandations de lisibilité ; combiné aux gris faible contraste sur fond noir et au tracking large, des données importantes (responsable, demi-vie, date de mesure servant aux calculs de décroissance, permissions) deviennent difficiles à lire, surtout pour des utilisateurs presbytes en environnement clinique. Risque d'erreur de lecture d'un identifiant ou d'une date.
- **Correctif :** Relever les tailles minimales à 12px (text-xs) pour toute donnée, réserver les micro-tailles aux éléments purement décoratifs, augmenter le contraste des textes secondaires (éviter slate-500/600 sur fond noir), et limiter italique/uppercase sur les contenus à lire.
- **Vérification :** CONFIRMÉ, maintenu P2. Lignes vérifiées : 782 (text-[9px] responsableOperator), 786 et 790 (text-[10px] T½ et date), 1007 (text-[10px] détail élimination), 1464 (text-[9px] permissions), 334/374/396/406/421/475/570 (text-[10px]). Toutes exactes. P2 cohérent (lisibilité/contraste, dégrade l'usage mais ne bloque pas).

### [ARCH-03] Imports dynamiques de Firebase répétés à chaque action (16 occurrences)

- **Localisation :** ``
- **Problème :** Pattern répété: import('@/lib/firebase').then(({db}) => import('firebase/firestore').then(({doc, setDoc...}) => ...)). Chaque handler ré-importe dynamiquement le SDK et déstructure les helpers à la volée, avec imbrication de .then. Comptage vérifié: 12 occurrences de import('@/lib/firebase') + 4 occurrences de import('../lib/firebase') = 16 imports dynamiques du module firebase, et 28 occurrences d'import('firebase/firestore'). lib/firebase.ts exporte déjà db/auth de façon statique (l.16-18 et l.22), donc l'import dynamique n'apporte aucun bénéfice de code-splitting réel ici puisque les helpers firestore sont rechargés partout.
- **Impact :** Lisibilité fortement dégradée (double/triple imbrication de promesses dans chaque action), perte de l'auto-complétion/typage, risque d'oubli de gestion d'erreur, surcoût cognitif. Le pattern empêche aussi le tree-shaking cohérent et complique tout futur mock pour les tests.
- **Correctif :** Importer statiquement les helpers firestore une fois dans le module repository (import { doc, setDoc, ... } from 'firebase/firestore') et appeler des fonctions async classiques (await repo.create(...)). Supprimer les imports dynamiques sauf besoin réel de lazy-loading mesuré.
- **Vérification :** CONFIRMÉ. Le chiffre exact de 16 imports dynamiques du module firebase est vérifié (12 via alias @/, 4 via chemin relatif ../). À noter que l'audit ne compte pas explicitement les 28 import('firebase/firestore'), donc le pattern global est même plus lourd que décrit. Le module lib/firebase.ts exporte bien db/auth/secondaryAuth statiquement, rendant l'import dynamique inutile. Sévérité P2 maintenue (qualité/lisibilité, pas un risque de sûreté direct).

### [ARCH-07] ESLint désactivé au build (ignoreDuringBuilds: true) + double config

- **Localisation :** ``
- **Problème :** next.config.ts l.5-7 contient eslint: { ignoreDuringBuilds: true }, donc aucune erreur de lint ne bloque jamais le build de production. De plus, deux configurations ESLint coexistent: eslint.config.mjs (flat config étendant eslint-config-next) ET .eslintrc.json ({ extends: 'next' }), ce qui crée une ambiguïté sur la config réellement appliquée par eslint 9.39 (l'eslintrc legacy est normalement ignoré quand un flat config existe, mais la coexistence est une source de confusion). Combiné à l'usage massif de any (ARCH-04) et aux imports morts (ARCH-06), aucun garde-fou statique n'est actif au build. Nuance: typescript.ignoreBuildErrors est à false (l.9), donc les erreurs de TYPE bloquent toujours le build — le typecheck reste actif.
- **Impact :** Du code non conforme (any toléré par config, variables inutilisées, hooks mal utilisés) peut être déployé sans alerte ESLint. Sur une appli médicale, l'absence de barrière de lint automatisée au build augmente le risque de régression silencieuse en production. Atténuation: les erreurs TypeScript restent bloquantes (ignoreBuildErrors: false).
- **Correctif :** Retirer ignoreDuringBuilds (ou le réserver à un flag CI temporaire), corriger les erreurs remontées, unifier sur eslint.config.mjs (supprimer .eslintrc.json), et brancher le lint + typecheck dans une CI bloquante.
- **Vérification :** CONFIRMÉ. next.config.ts l.5-7 = eslint.ignoreDuringBuilds: true vérifié. Les deux fichiers eslint.config.mjs ET .eslintrc.json existent bien (ls confirmé) — double config réelle. Correction apportée à l'audit: typescript.ignoreBuildErrors est explicitement à false (l.8-10), donc le typecheck N'est PAS désactivé, contrairement à ce que pourrait laisser croire 'aucun garde-fou statique actif' — seul ESLint l'est. Sévérité P2 maintenue.

### [ARCH-09] Duplication massive des formulaires, tables et logique CRUD

- **Localisation :** ``
- **Problème :** Le pattern CRUD est copié-collé dans 4 vues: chacune redéfinit useState(formData), handleChange = (e:any) => setFormData({...formData,[e.target.name]:e.target.value}) (identique l.635, 917, 1036, 1324), resetForm, handleSubmit avec branche editId/create, handleEdit, et une <table> au markup quasi identique (même thead/tbody, mêmes classes Tailwind, mêmes badges de statut). Les générateurs d'ID sont aussi dupliqués et fragiles: `WST-${isotopeCode}-${padStart(wasteItems.length+1)}` (l.665) et `INC-2024-${padStart(incidents.length+1)}` (l.1059), basés sur la longueur du tableau — risque de collision/réutilisation d'ID après suppression d'un item.
- **Impact :** Toute correction (validation, format d'ID, style) doit être répétée 4 fois avec risque d'oubli. Le calcul d'ID par length+1 peut générer des doublons après suppression d'un item, ce qui corromprait l'unicité du numéro de registre réglementaire (un même 'Numéro Unique' réattribué écraserait le document existant via setDoc). C'est un risque d'intégrité de données réel, pas seulement esthétique.
- **Correctif :** Factoriser un hook useCrudResource générique et des composants DataTable/EntityForm réutilisables. Remplacer la génération d'ID par crypto.randomUUID() ou un compteur Firestore/serverTimestamp pour garantir l'unicité. Mutualiser FormInput/FormSelect (déjà partiellement fait) avec un schéma de validation.
- **Vérification :** CONFIRMÉ. handleChange identique à l.635 (Identification), 917 (Sortie - controlData), 1036 (Incidents), 1324 (Users). Tables quasi-identiques vérifiées (thead/tbody/classes répétés dans Dashboard l.568, Identification l.764, Decroissance l.866, Sortie l.979). Génération d'ID fragile vérifiée: l.665 `WST-${isotopeCode}-${String(wasteItems.length+1).padStart(3,'0')}` et l.1059 `INC-2024-${String(incidents.length+1).padStart(3,'0')}` — basée sur length, donc après suppression la collision est réelle et setDoc (l.683/1069) écraserait silencieusement. Sévérité P2 maintenue (le risque de collision d'ID frôle le P1 mais reste conditionnel à un scénario suppression/recréation; la duplication elle-même est P2).

### [ARCH-10] Nommage/maintenabilité: valeurs en dur, métadonnées par défaut, état dérivé incohérent

- **Localisation :** ``
- **Problème :** Le composant racine s'appelle NuclearWasteApp (l.33) alors que l'app est 'RadWaste Pro' (l.235, 331). layout.tsx l.4-7 expose encore le titre/description par défaut 'My Google AI Studio App' (scaffold non personnalisé pour une appli réglementée). L'identité utilisateur affichée dans le header (l.373-377) prend systématiquement users[0] au lieu de currentUserProfile, donc affiche le PREMIER utilisateur de la liste et non l'utilisateur connecté. Le footer (l.476-481) affiche des données factices codées en dur ('Conformité ASN/AFNOR: Active-2023.v4', 'Capacité de stockage: 78.4%', 'Heure locale: 14:48:12' figée). storageResponsible est figé à 'Dr. Martin' (l.679) pour tout nouveau déchet. Les props setWasteItems/setIncidents/setUsers sont passées aux vues (l.448-466) mais jamais utilisées (les données viennent des snapshots Firestore).
- **Impact :** Affichage trompeur (mauvais nom d'utilisateur dans le header, indicateurs de conformité/capacité fictifs sur une appli se présentant comme conforme ASN), responsable de stockage erroné enregistré dans les données (toujours 'Dr. Martin' quelle que soit la saisie), props mortes ajoutant du bruit. Atteinte à la crédibilité et à l'exactitude des données affichées ET stockées dans un contexte réglementé — l'indicateur 'Conformité ASN/AFNOR: Active' factice est particulièrement problématique sur un outil médical.
- **Correctif :** Renommer le composant, personnaliser layout.tsx (titre/description RadWaste Pro), afficher currentUserProfile dans le header (au lieu de users[0]), retirer ou alimenter réellement les indicateurs du footer (ne JAMAIS afficher de chiffres de conformité factices), saisir storageResponsible depuis le profil/formulaire, et supprimer les props setX inutilisées.
- **Vérification :** CONFIRMÉ intégralement. NuclearWasteApp l.33 vs 'RadWaste Pro' l.235/331 vérifié. layout.tsx l.5-6 = 'My Google AI Studio App' (titre ET description) vérifié. Header l.373-374 et 377 utilise bien users[0].name/role/initiales au lieu de currentUserProfile (qui existe pourtant, l.43) — bug d'affichage réel. Footer l.476-481: 'Conformité ASN/AFNOR: Active-2023.v4', 'Capacité de stockage: 78.4%', 'Heure locale: 14:48:12' tous codés en dur (l'heure n'est même pas dynamique). storageResponsible: 'Dr. Martin' figé l.679 vérifié. Props setWasteItems/setIncidents/setUsers passées l.448-466 mais aucune des vues ne les appelle (toutes écrivent via Firestore). RELÈVEMENT de sévérité de P3 à P2: l'affichage d'un faux indicateur 'Conformité ASN Active' + un responsable de stockage systématiquement erroné dans les enregistrements vont au-delà du cosmétique sur une appli réglementée (intégrité des données + tromperie sur la conformité). Le reste (nom de composant, props mortes) serait P3, mais le footer factice + storageResponsible figé justifient P2.

### [CFG-01] Configuration Firebase (apiKey) committée en clair dans le dépôt

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/firebase-applet-config.json — l.1-10`
- **Problème :** Le fichier firebase-applet-config.json est suivi par git (confirmé via `git ls-files`, le fichier apparaît dans la liste) et contient apiKey="AIzaSyCoAfash-3F5KaeTVZj-ykjn3Esr86IxkI" (ligne 4), projectId="gen-lang-client-0087365249", appId, authDomain, storageBucket, messagingSenderId et firestoreDatabaseId. Il est importé directement comme fallback dans lib/firebase.ts (ligne 4 `import localFirebaseConfig from '../firebase-applet-config.json'`, utilisé lignes 7-13 via le pattern `process.env.NEXT_PUBLIC_* || localFirebaseConfig.*`). Le .gitignore (lignes 6-7) ignore `.env*` (sauf .env.example) mais n'exclut PAS ce fichier JSON, qui est donc versionné. NB important : une apiKey Firebase Web n'est PAS un secret serveur — elle est conçue pour transiter vers le client et n'autorise rien par elle-même ; la sécurité réelle repose sur les règles Firestore (firestore.rules) et App Check.
- **Impact :** Toute personne ayant accès au dépôt obtient l'identité du projet Firebase de production. Une clé API Web Firebase n'octroie cependant aucun droit en soi : l'exposition n'est dangereuse que si elle se combine à des règles Firestore laxistes et à l'absence d'App Check (à vérifier dans la dimension sécurité). Le risque concret est plutôt un défaut de gouvernance (pas de séparation dev/prod, identifiants de prod versionnés) qu'une fuite de secret exploitable directement.
- **Correctif :** Retirer firebase-applet-config.json du suivi git (`git rm --cached`), l'ajouter au .gitignore, et le purger de l'historique (git filter-repo / BFG). Faire reposer la config uniquement sur les variables NEXT_PUBLIC_FIREBASE_* (déjà lues en priorité dans lib/firebase.ts). Restreindre la clé via les restrictions de clé API Google Cloud + activer Firebase App Check. Séparer projets dev et prod. Surtout : durcir firestore.rules (la vraie ligne de défense).
- **Vérification :** CONFIRMÉ sur les faits matériels : `git ls-files` retourne bien firebase-applet-config.json (tracké). Contenu vérifié : apiKey en clair à la ligne 4, valeur identique à celle citée. Import et fallback confirmés dans lib/firebase.ts lignes 4 et 7-13. .gitignore vérifié : `.env*` ignoré (l.6) mais aucun motif n'exclut le JSON. SÉVÉRITÉ RABAISSÉE P1 -> P2 : une clé API Firebase Web est publique par conception (incluse dans tout bundle client déployé) et n'est pas un secret au sens OWASP ; isolément elle n'est pas exploitable. Le constat reste réel comme défaut de gouvernance des secrets et d'hygiène repo, mais P1 surestime un risque qui dépend entièrement des règles Firestore/App Check traités ailleurs.

### [CFG-02] ESLint désactivé pendant le build (ignoreDuringBuilds) sur une appli réglementée

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/next.config.ts — l.5-7`
- **Problème :** next.config.ts contient `eslint: { ignoreDuringBuilds: true }` (lignes 5-7). Le build de production (`next build`) ne fait donc échouer aucune erreur de lint. Combiné à l'absence totale de CI (aucun dossier .github/ — confirmé absent —, aucun fichier .yml/.yaml suivi par git) et à un usage massif de `any` dans app/page.tsx (line 38 `useState<any[]>([])` pour actionLogs, line 42 `useState<any>(null)` pour authUser, et de nombreux autres : lignes 58-62, 117, 146, 202, 491, 598...), il n'existe aucun garde-fou qualité automatique avant déploiement. Le script `lint` existe (package.json ligne 9 `eslint .`) mais n'est jamais exécuté de manière contraignante. `typescript.ignoreBuildErrors` est correctement laissé à false (ligne 9).
- **Impact :** Des défauts détectables statiquement (hooks mal utilisés, dépendances d'effet manquantes, variables non définies, accès potentiellement nuls) peuvent atteindre la production sans alerte. Pour une application gérant traçabilité et calculs de décroissance radioactive, l'absence de filet qualité automatisé augmente le risque de régressions silencieuses. Le typage `any` étendu fait par ailleurs perdre la protection TypeScript là où elle compterait le plus.
- **Correctif :** Passer `ignoreDuringBuilds` à false (ou retirer le bloc eslint). Mettre en place une CI (GitHub Actions) exécutant `npm ci`, `npm run lint`, `tsc --noEmit` et `npm run build` à chaque PR, avec blocage du merge en cas d'échec.
- **Vérification :** CONFIRMÉ. next.config.ts lignes 5-7 vérifiées (`ignoreDuringBuilds: true`), ligne 9 `ignoreBuildErrors: false` correcte. Absence de .github/ confirmée (`ls .github` -> no .github) et aucun .yml/.yaml tracké (`git ls-files` -> no yml). Les lignes citées pour `any` sont en fait EXACTES après lecture : line 38 = `useState<any[]>([])` (actionLogs), line 42 = `useState<any>(null)` (authUser) ; la formulation `actionLogs: any[]` de l'audit était une paraphrase mais les n° de ligne tombent juste. SÉVÉRITÉ RABAISSÉE P1 -> P2 : désactiver le lint au build est une mauvaise pratique réelle mais c'est un défaut de processus/qualité, pas une vulnérabilité ni un bug fonctionnel avéré ; ESLint ne bloque de toute façon pas `next build` par défaut sur les erreurs de type. P2 reflète mieux un risque indirect.

### [CFG-03] Capacité Gemini déclarée et GEMINI_API_KEY exigée alors qu'aucun code n'utilise Gemini

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/metadata.json — l.5`
- **Problème :** metadata.json déclare `"majorCapabilities": ["MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"]` (ligne 5). Le README (ligne 18) demande de configurer `GEMINI_API_KEY`, et .env.example (lignes 1-4) la liste comme « Required ». Or une recherche insensible à la casse de `genai|gemini|GoogleGenerativeAI|GoogleGenAI` sur tout le repo ne renvoie de résultats QUE dans des fichiers de config/doc (package-lock.json, package.json, metadata.json, README.md, .env.example) — AUCUN dans le code source (.ts/.tsx). La dépendance `@google/genai ^2.4.0` (package.json ligne 13) n'est jamais importée. Vestige du gabarit AI Studio jamais retiré.
- **Impact :** La capacité serveur Gemini déclarée demande une permission/clé inutile : exigence de configuration trompeuse pour l'exploitant (qui croit devoir fournir une clé Gemini), surface de dépendance supply-chain inutile (@google/genai dans le bundle d'install), et documentation incohérente sur les fonctionnalités réelles. Sur un produit présenté comme « conforme ASN », ces incohérences nuisent à l'auditabilité.
- **Correctif :** Supprimer `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` de metadata.json, retirer la dépendance @google/genai du package.json, et purger GEMINI_API_KEY / APP_URL du README et de .env.example tant qu'aucune intégration Gemini n'est prévue.
- **Vérification :** CONFIRMÉ. metadata.json ligne 5 vérifiée. .env.example lignes 1-4 vérifiées (GEMINI_API_KEY + commentaire « Required... »), README ligne 18 vérifiée. Le grep genai/gemini ne touche que package-lock, package.json, metadata.json, README, .env.example — zéro occurrence dans le code source, confirmant que @google/genai (package.json l.13) est inutilisé. Sévérité MAINTENUE à P2 : incohérence de configuration/documentation réelle avec léger impact supply-chain et trompe l'exploitant, sans bug fonctionnel direct. P2 adapté.

### [CFG-06] Aucun test, aucune CI, aucun déploiement Firebase documenté pour une appli médicale réglementée

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/package.json — l.5-11`
- **Problème :** Les scripts npm se limitent à dev/build/start/lint/clean (lignes 6-10) : aucun script `test`. Aucun fichier de test (glob `**/*.{test,spec}.{ts,tsx,js,jsx}` = vide ; aucun vitest/jest config). Aucune CI (.github/ absent, aucun .yml tracké). Côté déploiement Firebase : aucun firebase.json ni .firebaserc (`ls` confirme leur absence) alors que firestore.rules existe ET est suivi par git (donc doit être déployé manuellement) ; firebase-tools ^15.0.0 est déclaré en devDependency (package.json ligne 37) sans aucun script ni procédure l'utilisant. Le README (gabarit AI Studio) ne documente que `npm install` + `npm run dev` et renvoie vers ai.studio ; rien sur le déploiement, les règles Firestore, ni la config Firebase de production.
- **Impact :** Pour une application se revendiquant « conforme ASN » et manipulant traçabilité, intégrité des données et calculs radiophysiques, l'absence totale de tests automatisés (notamment sur la décroissance et le backup/restore) et de pipeline de validation rend la non-régression invérifiable. L'absence de procédure de déploiement des règles Firestore expose au risque de déployer le code sans les règles de sécurité associées (ou avec des règles obsolètes), ce qui amplifie directement le risque évoqué en CFG-01.
- **Correctif :** Ajouter une suite de tests (Vitest/Jest) couvrant en priorité les calculs de décroissance et l'export/import, un script `test`, et une CI exécutant lint+typecheck+test+build. Ajouter firebase.json + .firebaserc, documenter `firebase deploy --only firestore:rules` et la création des variables NEXT_PUBLIC_FIREBASE_*. Réécrire le README spécifique à RadWaste Pro au lieu du gabarit AI Studio.
- **Vérification :** CONFIRMÉ. package.json lignes 5-11 : scripts dev/build/start/lint/clean, pas de `test`. Glob tests = aucun fichier ; glob vitest/jest config = aucun. .github/ absent, aucun .yml tracké. `ls firebase.json .firebaserc` -> absents ; firestore.rules présent et tracké (`git ls-files`). firebase-tools en devDep ligne 37 confirmé. README vérifié = gabarit AI Studio (npm install / npm run dev / lien ai.studio). Sévérité MAINTENUE P2 : risque sérieux de processus/sûreté pour une app réglementée, mais c'est un défaut d'absence de garde-fous et non un bug exploitable identifié ; P2 cohérent (un P1 supposerait une vulnérabilité ou défaillance fonctionnelle avérée).

### [DATA-03] Statut 'incident' déclaré dans le type mais jamais affecté : statut mort et incohérence de modèle

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/types.ts — l.types.ts:3 ; page.tsx:681,825,835,924,1132,1147-1149`
- **Problème :** Confirmé. WasteStatus inclut 'incident' (types.ts l.3 : `'stockage' | 'liberable' | 'elimine' | 'incident'`) mais ce statut n'est jamais assigné : les seules affectations de status dans page.tsx sont 'stockage' (l.681 création), 'liberable' (l.825/835 passage de seuil), 'elimine' (l.924 élimination). Les incidents sont une collection séparée. Déclarer un incident lié à un wasteId (y compris 'Perte de déchet', option l.1114) via handleSubmit (l.1058-1069) n'écrit qu'un document incidents et ne touche jamais au statut du déchet. Conséquence : un déchet déclaré perdu reste 'En Stockage', continue d'apparaître dans l'inventaire (PrintInventaire l.1250 inclut stockage+liberable), dans les calculs de décroissance et dans totalActivity.
- **Impact :** Incohérence métier : un déchet faisant l'objet d'un incident (perte, contamination) n'est pas distingué dans inventaires et rapports. L'inventaire radiologique peut compter comme présent un déchet déclaré perdu. Le statut 'incident' du type induit en erreur sur les capacités réelles. Impact modéré : pas de perte de données mais incohérence de registre.
- **Correctif :** Soit retirer 'incident' de WasteStatus s'il n'est pas utilisé, soit implémenter la transition : lors de la déclaration d'un incident lié à un wasteId (notamment 'Perte de déchet'), mettre à jour le statut du déchet et l'exclure des inventaires de stock. Documenter la règle d'états.
- **Vérification :** CONFIRMÉ par lecture de types.ts l.3 et de toutes les affectations de status dans page.tsx (recherche exhaustive : l.681, 825, 835, 924 — aucune n'utilise 'incident'). handleSubmit incident (l.1058-1069) n'écrit que dans la collection incidents. P2 maintenu : c'est une incohérence de modèle réelle avec un effet inventaire, mais pas une corruption/perte de données silencieuse. Sévérité correcte (ni surévaluée ni sous-évaluée).

### [DATA-05] Bouton 'mot de passe oublié' conditionné sur une chaîne jamais émise : code mort, fonctionnalité inaccessible

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.261-278, 209-227`
- **Problème :** Confirmé. Le bouton de réinitialisation (l.261-278) n'est rendu que si `loginError.includes('Compte déjà existant')` (l.261). Aucune branche de handleLogin n'affecte cette chaîne : les messages possibles sont 'Le mot de passe est incorrect.' (l.210), 'Erreur: ' + message (l.212), 'Identifiants incorrects...' (l.218), 'Trop de tentatives...' (l.220), 'Erreur de connexion. (code)' (l.222), 'Une erreur est survenue.' (l.227). La sous-chaîne 'Compte déjà existant' n'apparaît nulle part ailleurs. Le bloc l.261-278 (dont sendPasswordResetEmail l.268) est donc du code mort : le bouton ne s'affiche jamais.
- **Impact :** Aucun utilisateur ne peut réinitialiser son mot de passe via l'UI. Comptes créés par l'admin avec un mot de passe initial (l.1361/1429) : un utilisateur ayant oublié son mot de passe est bloqué et doit contacter l'admin, alors que la capacité technique (sendPasswordResetEmail) existe mais reste inatteignable. Impact UX/opérationnel, pas de risque de données.
- **Correctif :** Afficher inconditionnellement un lien 'Mot de passe oublié' (toujours visible), ou déclencher l'affichage sur un cas réel (err.code 'auth/invalid-credential'/'auth/wrong-password'). Supprimer la condition fantôme sur 'Compte déjà existant'.
- **Vérification :** CONFIRMÉ par lecture de page.tsx l.192-228 (handleLogin) et l.261-278 (bouton). Vérification exhaustive des messages d'erreur affectés à loginError : aucun ne contient 'Compte déjà existant'. Le bloc est bien du code mort. P2 maintenu : impact réel sur l'accessibilité d'une fonctionnalité d'authentification, mais contournable par l'admin, pas de risque de sûreté ni de données. Sévérité appropriée.

### [DATA-06] Header affiche users[0] au lieu de currentUserProfile : identité d'utilisateur erronée

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.373-377`
- **Problème :** Confirmé. Le coin supérieur droit affiche `users.length > 0 ? users[0].name : 'Utilisateur'` (l.373), `users[0].role` (l.374) et les initiales de `users[0].name` (l.377). users[0] est le premier document de la collection (ordre Firestore non garanti, requête l.105 sans orderBy), non lié à l'utilisateur connecté. L'utilisateur authentifié est dans currentUserProfile (état dédié l.43, renseigné l.87/89/110). L'en-tête identifie donc l'opérateur courant par un utilisateur arbitraire de la base. À noter : logAction utilise correctement currentUserProfile?.email (l.174), d'où l'incohérence entre l'affichage et le journal.
- **Impact :** Affichage trompeur de l'identité dans une appli où la responsabilité nominative compte (radioprotection, traçabilité). L'écran peut montrer un nom/rôle qui n'est pas celui de la personne connectée — confusion sur qui réalise une action, incohérence avec le userEmail réellement journalisé. Impact cosmétique/confiance, pas de corruption de données.
- **Correctif :** Remplacer users[0] par currentUserProfile dans l'en-tête : currentUserProfile?.name, currentUserProfile?.role, et initiales dérivées de currentUserProfile?.name, avec repli sûr si null.
- **Vérification :** CONFIRMÉ par lecture directe de page.tsx l.371-378. users[0] est bien utilisé pour name (l.373), role (l.374) et initiales (l.377). currentUserProfile existe (l.43, 87, 89, 110) et est le bon état. logAction utilise currentUserProfile?.email (l.174), confirmant l'incohérence. P2 maintenu : bug réel et trompeur sur une appli de traçabilité, mais sans effet sur les données persistées (le journal utilise la bonne identité). Sévérité correcte.

### [DATA-08] totalActivity exclut 'liberable' et nonConformes mélange non-conformités et incidents : KPI dashboard incohérents

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.151-166, 154, 156-163`
- **Problème :** Confirmé. totalActivity (l.156-163) ne somme que les déchets `status === 'stockage'` (l.157), excluant les 'liberable'. Or un déchet 'liberable' est physiquement présent dans le local tant qu'il n'est pas 'elimine' — la table d'inventaire PrintInventaire l.1250 inclut bien stockage ET liberable, confirmant que 'liberable' est physiquement présent. Le KPI 'Activité Restante' sous-estime donc l'activité réellement stockée. Par ailleurs nonConformes (l.154) = `wasteItems.filter(w => w.exitConformity === false).length + incidentsCount`, additionnant deux notions hétérogènes (non-conformité de sortie vs nombre d'incidents) dans un même chiffre, avec double comptage possible (un déchet sorti non conforme ayant aussi un incident est compté des deux côtés).
- **Impact :** Indicateurs de pilotage faux : activité totale présente sous-évaluée (un déchet libérable de forte activité résiduelle non compté), pouvant masquer un dépassement de capacité/seuil de présence radiologique. Le compteur 'Non Conformes / Incidents' agrège des grandeurs non additives. Impact modéré : KPI de tableau de bord, n'altère pas les enregistrements individuels.
- **Correctif :** Inclure les statuts 'stockage' ET 'liberable' dans totalActivity (tout ce qui est physiquement présent et non 'elimine'). Séparer ou clarifier le KPI non-conformités vs incidents (deux compteurs distincts) pour éviter l'agrégation ambiguë et le double comptage.
- **Vérification :** CONFIRMÉ par lecture de page.tsx l.151-166 (metrics) et l.1250 (PrintInventaire inclut stockage+liberable, prouvant que 'liberable' est physiquement présent). totalActivity filtre bien `status === 'stockage'` seul (l.157). nonConformes mélange bien exitConformity===false + incidentsCount (l.154). P2 maintenu : incohérence réelle d'indicateurs avec risque de masquer un dépassement, mais c'est de l'agrégation d'affichage (les données sources restent correctes). Sévérité appropriée — ni P1 ni P3.

### [DATA-09] Listeners onSnapshot assignés dans des .then() imbriqués mais cleanup synchrone et non annulés au changement d'auth : fuite de listeners

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.57-142`
- **Problème :** Confirmé. Dans le useEffect principal (l.57-142), les unsub (unsubWaste l.94, unsubIncidents l.100, unsubUsers l.106, unsubLogs l.115) sont assignés à l'intérieur de chaînes de promesses imbriquées : import('@/lib/firebase').then → import('firebase/auth').then → onAuthStateChanged(async user => import('firebase/firestore').then(...)). Le cleanup retourné (l.135-141) s'exécute de façon synchrone au démontage et lit ces variables locales de l'effet. Si le composant est démonté avant résolution des .then() (StrictMode double-mount en dev React 19, ou navigation rapide), le cleanup voit des unsub encore undefined → abonnements non annulés, onSnapshot continue et appelle setState sur composant démonté. De plus, à chaque émission de onAuthStateChanged signalant un user, de nouveaux listeners sont créés (l.94-118) sans annuler les précédents : les variables unsub* sont écrasées sans appel préalable, accumulant les abonnements à chaque transition d'auth (la branche else l.120-130 annule bien, mais la branche if user ne le fait pas avant de recréer).
- **Impact :** Fuite d'abonnements Firestore en dev (StrictMode) et lors des transitions d'authentification : listeners orphelins lisant la base et tentant des setState sur composant démonté, surcoût réseau/quota Firestore, warnings React, comportements doublés possibles. Pas de perte de données ; fiabilité dégradée.
- **Correctif :** Stocker les unsub dans des refs ou un objet mutable capturé. Toujours annuler les listeners précédents au début du callback onAuthStateChanged (branche user) avant d'en recréer. Préférer un chargement non imbriqué (await en tête d'effet) avec flag isMounted. S'assurer que le cleanup peut annuler des abonnements créés de façon asynchrone (tableau de unsub partagé par référence).
- **Vérification :** CONFIRMÉ par lecture de page.tsx l.57-142. Structure des .then() imbriqués confirmée (l.64-65-71). Assignations des unsub à l'intérieur de la promesse confirmées (l.94, 100, 106, 115). Cleanup synchrone l.135-141 lisant les variables locales. Branche else (user déconnecté) annule bien les unsub l.126-129, mais la branche if (user présent) recrée les listeners sans annuler les précédents → accumulation au changement d'auth confirmée. P2 maintenu : problème de fiabilité réel (fuite, warnings, double-mount StrictMode) mais sans corruption ni perte de données, principalement visible en dev et lors de transitions d'auth multiples. Sévérité appropriée.

### [I18N-01] lang="en" sur une application entièrement en français

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/layout.tsx — l.11`
- **Problème :** `<html lang="en">` (layout.tsx:11) alors que 100% de l'interface est en français (libellés, formulaires, rapports, messages). Vérifié : seul lang="en" existe dans tout app/.
- **Impact :** Les lecteurs d'écran appliqueront une synthèse vocale anglaise à du texte français (prononciation incorrecte des termes : 'décroissance', 'libérable', 'ANDRA'...). Non conforme WCAG 3.1.1 (Language of Page). Impacte aussi la correction orthographique du navigateur et l'indexation.
- **Correctif :** Remplacer par `<html lang="fr">`.
- **Vérification :** CONFIRMÉ, maintenu P2. layout.tsx:11 contient bien lang="en" et le grep confirme l'absence de tout autre lang. Correctif trivial mais réel impact WCAG 3.1.1 ; P2 approprié.

### [I18N-02] Titre d'onglet non personnalisé : 'My Google AI Studio App'

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/layout.tsx — l.4-7`
- **Problème :** metadata = { title: 'My Google AI Studio App', description: 'My Google AI Studio App' } (layout.tsx:4-7). Le titre/description par défaut du générateur n'ont jamais été remplacés, alors que metadata.json à la racine contient le bon nom FR ('Application de Gestion des Déchets Radioactifs en Médecine Nucléaire') et une description ASN. L'onglet du navigateur affiche donc 'My Google AI Studio App'.
- **Impact :** Pour une appli se présentant comme conforme ASN et professionnelle, un titre d'onglet générique anglophone nuit à la crédibilité, à l'identification de l'onglet (un soignant peut avoir plusieurs onglets) et aux favoris/historique. Indice de produit non finalisé.
- **Correctif :** Mettre title: 'RadWaste Pro — Gestion des déchets radioactifs' et une description FR cohérente (réutiliser celle de metadata.json). Idéalement un template de titre par module.
- **Vérification :** CONFIRMÉ, maintenu P2. layout.tsx:5-6 contient littéralement 'My Google AI Studio App' (titre ET description), et metadata.json (lu) contient bien le nom et la description FR corrects. Le constat de l'audit est exact à 100%. P2 approprié (crédibilité/cosmétique, pas de blocage fonctionnel).

### [REG-06] Absence de gardes numériques dans getTheoreticalReleaseDate et calculateResidual (halfLife<=0, activité=0, NaN)

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.598-616 (fonctions de calcul), 156-163 (totalActivity)`
- **Problème :** getTheoreticalReleaseDate (l.611-616) calcule hoursNeeded = halfLife * log(clearance/initial)/log(0.5). Si initialActivity=0, clearance/0 = Infinity, log(Infinity)=Infinity et hoursNeeded devient -Infinity (log(0.5)<0) -> 'Invalid Date'. Si halfLife=0, hoursNeeded = NaN. calculateResidual (l.598-602) et calculateDecayPercentage (l.604-609) avec halfLife=0 produisent hours/0 = Infinity puis 0.5^Infinity = 0, donnant 100% de décroissance immédiate (donc 'libérable' à tort). `Math.max(0, hl)` (l.600,606) ne protège que d'un t négatif (jamais atteint), pas de la division par zéro. totalActivity du dashboard (l.156-163) n'a même pas ce Math.max.
- **Impact :** Affichage de dates/pourcentages erronés ('Invalid Date', 100% immédiat) et, combiné à REG-02, classification 'libérable' instantanée d'un déchet à halfLife corrompue. Fiabilité des calculs compromise dans les cas limites.
- **Correctif :** Valider en entrée halfLife > 0 et initialActivity > 0 (cf. REG-02). Dans les fonctions de calcul, retourner explicitement un état 'données invalides' si halfLife<=0 ou initialActivity<=0 au lieu de propager Infinity/NaN. Centraliser ces calculs dans une fonction unique réutilisée par dashboard et vues.
- **Vérification :** CONFIRMÉ : l.598-616 vérifiées, Math.max(0,hl) borne uniquement le bas de hl (cas t<0), pas la division par halfLife=0. totalActivity (l.156-163) calcule hl = hours/item.halfLife sans aucun Math.max ni garde. Précision sur l'audit : si initialActivity=0, hoursNeeded -> -Infinity (pas +Infinity comme suggéré), mais le résultat final reste bien une 'Invalid Date' — conclusion correcte. Sévérité P2 maintenue : cas limites/robustesse, l'impact pratique de classification est déjà couvert par REG-02 (P0).

### [UX-03] select-none global empêchant la sélection/copie de texte (IDs, doses, dates)

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.320, 232, 298, 1646`
- **Problème :** Le conteneur racine de l'app authentifiée porte `select-none` (320), de même que l'écran de login (232) et l'écran d'accès non autorisé (298). Toute l'interface devient non sélectionnable, y compris les IDs de déchets (ex. 'WST-TC99M-001' rendu en font-mono ligne 581/778), les activités résiduelles, les dates, et l'email de support (support@imena-gest.net, ligne 1646 dans HelpView).
- **Impact :** L'utilisateur ne peut pas sélectionner/copier un identifiant de déchet, une activité résiduelle, une date de libération, ou l'email de support pour le coller ailleurs (email à l'ASN, dossier, ticket). Sur un outil de traçabilité où l'on reporte fréquemment des identifiants/valeurs, c'est un frein quotidien et une source d'erreurs de recopie manuelle.
- **Correctif :** Retirer le `select-none` global. Si l'objectif était d'éviter la sélection accidentelle des libellés de boutons/navigation, l'appliquer de façon ciblée sur ces seuls éléments et laisser les données (tableaux, valeurs, IDs, email) sélectionnables (`select-text`).
- **Vérification :** CONFIRMÉ, maintenu P2. Grep confirme select-none aux lignes 232, 298 et 320 (conteneur racine de la vue authentifiée), et l'email support@imena-gest.net est bien ligne 1646 dans HelpView, à l'intérieur du conteneur select-none. Aucun `select-text` localisé ne réactive la sélection sur les données (grep). Constat exact. P2 approprié (frein d'usage réel, non bloquant).

### [UX-04] Identité d'utilisateur affichée incorrecte : header montre users[0] au lieu du profil connecté

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.371-378`
- **Problème :** Le bloc identité du header affiche `users.length > 0 ? users[0].name : 'Utilisateur'` (373), `users[0].role` (374) et les initiales de `users[0]` (377). Or `currentUserProfile` (le profil réellement connecté) est chargé et disponible (résolu lignes 87/89/110). Le header affiche donc le PREMIER utilisateur de la liste (ordre arbitraire renvoyé par Firestore), pas l'utilisateur authentifié.
- **Impact :** Un manipulateur connecté peut voir affiché en haut à droite le nom et le rôle d'un autre membre du personnel (potentiellement 'Administrateur'). Sur un outil traçant qui fait quoi, afficher la mauvaise identité est trompeur et peut induire en erreur sur les droits perçus. Confusion d'identité dans un contexte où la responsabilité compte.
- **Correctif :** Remplacer toutes les références `users[0]` du header (373, 374, 377) par `currentUserProfile` (currentUserProfile.name, .role, initiales) pour afficher l'utilisateur réellement connecté.
- **Vérification :** CONFIRMÉ, maintenu P2. Lignes 373-377 vérifiées : le header lit bien users[0] et non currentUserProfile, alors que currentUserProfile est disponible (setCurrentUserProfile aux lignes 87/89/110). Le constat est exact. Sévérité P2 cohérente : affichage trompeur mais pas une faille de droits réelle (les permissions effectives ne dépendent pas de cet affichage). Note : les logs d'action utilisent bien currentUserProfile.email (174), donc la traçabilité réelle n'est pas faussée, seulement l'affichage.

## P3 — Mineur

### [ARCH-06] Imports morts (differenceInHours, mocks) et dépendances inutilisées

- **Localisation :** ``
- **Problème :** app/page.tsx l.4 importe { mockWaste, mockIncidents, mockUsers } et l.6 { differenceInHours }: aucun de ces symboles n'est utilisé ailleurs dans le fichier (seules les lignes d'import 4 et 6 matchent, vérifié par grep). Côté package.json: @google/genai (l.13), @hookform/resolvers (l.14) et react-hook-form sont absents du code source (grep sur **/*.{ts,tsx} ne trouve aucun usage). 'motion' (l.21) est déclaré et transpilé via next.config.ts l.23 mais n'est jamais importé. lib/utils.ts (cn via clsx + tailwind-merge) n'est importé par aucun fichier (grep sur from '@/lib/utils' = aucun résultat), donc class-variance-authority, clsx, tailwind-merge sont de facto morts.
- **Impact :** Bundle alourdi inutilement, surface d'attaque/maintenance accrue (mises à jour de sécurité de dépendances jamais utilisées), confusion sur l'intention du code (les mocks suggèrent un code de démo laissé en place). Risque mineur mais symptomatique du manque de discipline.
- **Correctif :** Supprimer les imports morts (l.4, l.6) et désinstaller @google/genai, @hookform/resolvers, motion (+ retirer transpilePackages dans next.config.ts l.23), ainsi que class-variance-authority/clsx/tailwind-merge si lib/utils n'est pas réintroduit. Activer la règle no-unused-vars pour prévenir la récidive.
- **Vérification :** CONFIRMÉ. grep confirme que mockWaste/mockIncidents/mockUsers (l.4) et differenceInHours (l.6) ne matchent QUE sur leur ligne d'import — jamais utilisés. grep sur '@google/genai|hookform|react-hook-form|from motion|from @/lib/utils' sur tous les .ts/.tsx = 'No matches found', donc ces deps + lib/utils.ts sont effectivement morts. next.config.ts l.23 confirme transpilePackages: ['motion']. Sévérité P3 maintenue (hygiène/bundle, pas de risque fonctionnel).

### [CFG-04] Dépendances déclarées mais jamais utilisées (motion, react-hook-form, cluster clsx/cva)

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/package.json — l.13-27`
- **Problème :** Usage réel vérifié par grep : (1) `motion ^12.23.24` (ligne 21) jamais importé (`from 'motion'` / framer-motion = uniquement dans package-lock) ; pourtant next.config.ts ligne 23 le force dans `transpilePackages: ['motion']`, transpilant un paquet inutilisé. (2) `@hookform/resolvers ^5.2.1` (ligne 14) : aucun `useForm`/`zodResolver`/`react-hook-form` dans le code (uniquement package.json + package-lock). (3) Cluster `clsx`+`tailwind-merge`+`class-variance-authority` : la seule consommatrice est lib/utils.ts (fonction `cn` ligne 4), mais `cn` n'est importé NULLE PART (grep ne trouve la définition que dans utils.ts, aucun import ailleurs) — sous-graphe mort. À l'inverse, date-fns EST utilisé (lib/data.ts ligne 2 addDays/subDays ; app/page.tsx ligne 6 differenceInHours), recharts (page.tsx ligne 9) et lucide-react (page.tsx ligne 29) aussi.
- **Impact :** Dépendances inutiles : surface d'audit supply-chain élargie, temps d'install et taille de lockfile accrus, transpilation superflue de `motion` au build, confusion pour le mainteneur. Pas de risque fonctionnel direct ; coût de maintenance et bruit de sécurité.
- **Correctif :** Retirer de package.json : @hookform/resolvers, motion (et l'entrée transpilePackages: ['motion'] dans next.config.ts). Supprimer lib/utils.ts s'il reste inutilisé, et avec lui clsx/tailwind-merge/class-variance-authority. Régénérer package-lock.json puis vérifier que `npm run build` reste vert.
- **Vérification :** CONFIRMÉ intégralement. `from 'motion'|framer-motion` -> uniquement package-lock (donc 0 usage code). `useForm|zodResolver|react-hook-form|@hookform` -> uniquement package.json + package-lock (0 usage code). `cn(` -> seule la définition lib/utils.ts:4 ; aucun import de lib/utils ni appel `cn(` ailleurs (grep `lib/utils|from '...utils'|\bcn\(` ne renvoie que la définition) -> sous-graphe clsx/tailwind-merge/cva mort. date-fns/recharts/lucide-react confirmés utilisés (data.ts:2, page.tsx:6/9/29). transpilePackages:['motion'] confirmé next.config.ts:23. Sévérité P3 MAINTENUE : hygiène/maintenance, aucun impact fonctionnel ou sécurité direct.

### [CFG-05] remotePatterns picsum.photos configuré mais aucune image distante utilisée

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/next.config.ts — l.11-21`
- **Problème :** next.config.ts autorise les images distantes depuis `picsum.photos` (remotePatterns, pathname '/**', lignes 11-21). Recherche sur tout le source : `picsum` n'apparaît dans aucun fichier source (grep `picsum|next/image` ne renvoie que next.config.ts et next-env.d.ts — ce dernier étant le fichier de types auto-généré de Next, pas un usage). page.tsx n'importe pas next/image. Reliquat de gabarit : le commentaire ligne 11 « Allow access to remote image placeholder » confirme l'origine boilerplate.
- **Impact :** Configuration morte : autorise un domaine externe d'images sans besoin, élargissant inutilement la politique de chargement d'images de next/image. Impact faible ; incohérence de config supplémentaire dans un projet présenté comme produit fini.
- **Correctif :** Supprimer le bloc images.remotePatterns de next.config.ts tant qu'aucune image distante n'est servie.
- **Vérification :** CONFIRMÉ. next.config.ts lignes 11-21 vérifiées (remotePatterns picsum.photos, pathname '/**', commentaire l.11). grep `picsum|next/image` -> next.config.ts (la config elle-même) et next-env.d.ts (fichier de types Next auto-généré, non un usage applicatif). Donc aucune image distante réellement servie. Sévérité P3 MAINTENUE : config morte sans impact fonctionnel.

### [CFG-07] Identité du projet incohérente : nom de package, titre HTML et bannière restent ceux du gabarit AI Studio

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/package.json — l.2`
- **Problème :** Le nom du package est `"ai-studio-applet"` (package.json ligne 2), pas un identifiant RadWaste. app/layout.tsx fixe `title: 'My Google AI Studio App'` et `description: 'My Google AI Studio App'` (lignes 5-6) avec `<html lang="en">` (ligne 11) alors que toute l'UI est en français. Le README (lignes 1-9) affiche encore la bannière et le lien AI Studio du gabarit. metadata.json, lui, porte bien le vrai nom de l'app (« Application de Gestion des Déchets Radioactifs... »). Le projet n'a jamais été rebaptisé sur ces surfaces.
- **Impact :** Métadonnées trompeuses : titre d'onglet/navigateur générique et faux, `lang="en"` incorrect (impact accessibilité/SEO et lecteurs d'écran sur une UI francophone), documentation pointant vers un gabarit Google. Pour un produit médical présenté à des utilisateurs/auditeurs, ce manque de finition décrédibilise et révèle le caractère prototype.
- **Correctif :** Renommer le package, mettre à jour title/description dans app/layout.tsx, passer `<html lang="fr">`, et remplacer le README par une documentation propre au produit.
- **Vérification :** CONFIRMÉ. package.json ligne 2 = `"ai-studio-applet"`. app/layout.tsx : title/description = 'My Google AI Studio App' (lignes 5-6), `<html lang="en">` (ligne 11). README lignes 1-9 = bannière + lien AI Studio. metadata.json porte bien le nom français réel (vérifié). Sévérité P3 MAINTENUE : finition/cohérence ; le `lang="en"` a un léger impact a11y réel mais pas de risque fonctionnel ou de sûreté. P3 adapté.

### [CFG-08] Imports inutilisés dans lib/firebase.ts (vestiges)

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/lib/firebase.ts — l.2`
- **Problème :** lib/firebase.ts importe statiquement `signInWithEmailAndPassword` et `createUserWithEmailAndPassword` (ligne 2) mais ne les utilise ni ne les ré-exporte ; seuls getAuth et signOut sont effectivement employés (signOut dans logout l.24-30, getAuth l.18/22). Ces deux fonctions d'auth sont en réalité ré-importées dynamiquement dans app/page.tsx (ligne 197 `const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth')` et ligne 1356 pour createUserWithEmailAndPassword). Les imports statiques de la ligne 2 sont donc morts. C'est précisément le type d'erreur qu'un lint au build (cf. CFG-02) signalerait.
- **Impact :** Imports morts : bruit, légère augmentation du graphe d'auth chargé statiquement, et signal que le code n'est pas passé au crible du linter. Impact fonctionnel négligeable.
- **Correctif :** Retirer les imports inutilisés de la ligne 2 (ne conserver que getAuth et signOut). Réactiver le lint pour capter automatiquement ce genre de cas.
- **Vérification :** CONFIRMÉ. lib/firebase.ts ligne 2 importe getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut ; dans le corps du fichier seuls getAuth (l.18/22) et signOut (l.28) sont utilisés, aucune ré-export. grep dans app/page.tsx confirme la ré-importation dynamique via `await import('firebase/auth')` aux lignes 197 et 1356. Les imports statiques l.2 de ces deux fonctions sont donc effectivement morts. Sévérité P3 MAINTENUE : code mort sans impact fonctionnel.

### [SEC-07] Configuration Firebase (clé API et identifiants projet) committée dans le dépôt

- **Localisation :** `firebase-applet-config.json + lib/firebase.ts + .gitignore — l.firebase-applet-config.json:1-10 ; lib/firebase.ts:4-13 ; .gitignore:6-7`
- **Problème :** Confirmé factuellement. firebase-applet-config.json contient projectId, appId, apiKey, authDomain, firestoreDatabaseId, storageBucket, messagingSenderId en clair (1-10). `git ls-files` confirme le suivi et `git log --follow` confirme l'ajout au commit 665ff43 'feat: integrate Firebase...'. Il est importé dans lib/firebase.ts:4 et utilisé en fallback des NEXT_PUBLIC_* (lignes 7-13). Le .gitignore ignore `.env*` (ligne 6) avec exception `!.env.example` (ligne 7) mais PAS ce JSON. Précision : ces valeurs Firebase web sont par nature publiques (livrées au navigateur dans tout déploiement) ; la clé API web n'est PAS un secret.
- **Impact :** Le projet Firebase devient directement identifiable/adressable par tout lecteur du dépôt. Combiné aux règles permissives (SEC-01) et à la création de comptes (SEC-09), un attaquant dispose des coordonnées pour créer un compte et accéder/altérer la base. L'exposition réduit l'effort d'attaque mais n'est pas en soi une fuite de secret.
- **Correctif :** Conserver la config via variables d'environnement NEXT_PUBLIC_* (déjà supportées dans lib/firebase.ts et .env.example) et retirer firebase-applet-config.json du suivi git (git rm --cached + ajout au .gitignore). Surtout : verrouiller la sécurité au niveau des règles Firestore (SEC-01), restreindre les domaines Auth autorisés et activer App Check, puisque la clé web reste visible côté client.
- **Vérification :** PREUVE : lecture du JSON (apiKey AIzaSy..., projectId gen-lang-client-0087365249), git ls-files confirme le suivi, git log --follow confirme commit 665ff43, .gitignore lignes 6-7 (.env* ignoré, JSON non couvert), lib/firebase.ts:4-13 (import + fallback). Sévérité ABAISSÉE de P2 à P3 : il s'agit de clés Firebase WEB publiques par conception (non secrètes) ; l'audit lui-même note que 'ces valeurs sont par nature publiques'. Le vrai risque réside dans SEC-01 (déjà P0). C'est une hygiène/bonne pratique, pas une exposition de secret => P3.

### [UX-05] États vides absents : tableaux et listes ne disent rien quand ils sont vides

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.579-589 (dashboard), 776-806 (identification), 877 (décroissance), 989-1014 (sortie), 1132-1167 (incidents), 1452-1484 (utilisateurs)`
- **Problème :** Les tableaux (déchets libérables du dashboard 579, identification/stockage 776, décroissance 877, sortie 989, utilisateurs 1452) et la liste d'incidents (1132) effectuent un simple `.filter().map()` rendant zéro ligne quand aucune donnée ne correspond, sans message d'état vide. Seuls le popover Notifications (365 'Aucune notification') et le journal de logs (1596 'Aucun log disponible...') gèrent le cas vide.
- **Impact :** Face à un tableau vide, l'utilisateur ne sait pas si (a) il n'y a réellement aucun déchet, (b) le filtre exclut tout, ou (c) le chargement a échoué silencieusement (voir UX-01). Ambiguïté gênante sur un outil de suivi où 'aucun déchet libérable' est une information de sûreté en soi.
- **Correctif :** Ajouter un état vide explicite par tableau/liste (ex: 'Aucun déchet en stockage', 'Aucun incident déclaré'), distinct d'un éventuel état d'erreur de chargement.
- **Vérification :** CONFIRMÉ, maintenu P3. Vérifié : chaque tbody/liste fait .filter(...).map(...) sans branche pour le cas vide (dashboard 579, identification 776, décroissance 877, sortie 989, incidents 1132, users 1452). Les deux exceptions citées par l'audit (Notifications 365, logs 1596) sont exactes. P3 approprié (gêne UX, non critique).

### [UX-06] Données factices/codées en dur affichées comme réelles (heure figée, capacité, responsable, préférences inertes)

- **Localisation :** `C:/Users/agbot/Desktop/radwaste/app/page.tsx — l.478-480, 335-336, 679, 1574-1575`
- **Problème :** Informations affichées comme opérationnelles mais statiques : footer 'Heure locale: 14:48:12' figé (480), 'Capacité de stockage: 78.4%' (478) et 'Capteurs: Actifs' (479) ; header 'Système: En ligne' / 'Serveur: Labo-Chaud-01' (335-336) ; `storageResponsible: 'Dr. Martin'` injecté en dur à chaque création de déchet (679) indépendamment de l'opérateur réel ; FormSelect 'Préférences Affichage' (thème/unité) avec `onChange={() => {}}` (1574-1575), donc inertes.
- **Impact :** Une heure figée et une capacité inventée donnent une fausse impression de supervision temps réel sur un outil de sûreté. 'Dr. Martin' devient le responsable de stockage de TOUS les déchets, ce qui fausse la traçabilité du champ storageResponsible. Les préférences d'affichage donnent l'illusion d'être configurables alors qu'elles ne font rien.
- **Correctif :** Retirer ou rendre dynamiques les indicateurs footer/header (au minimum une vraie horloge, sinon les supprimer). Renseigner storageResponsible avec l'utilisateur connecté (currentUserProfile) au lieu de 'Dr. Martin'. Retirer ou implémenter réellement les préférences d'affichage inertes.
- **Vérification :** CONFIRMÉ, maintenu P3. Vérifié : footer figé (478 '78.4%', 479 'Capteurs: Actifs', 480 'Heure locale: 14:48:12'), header statique (335-336), storageResponsible: 'Dr. Martin' codé en dur ligne 679 dans le newItem de création, et préférences onChange={() => {}} aux lignes 1574-1575. Toutes les preuves correspondent. Le 'Dr. Martin' en dur recoupe partiellement UX-04/traçabilité ; reste P3 car c'est de la donnée d'affichage/champ secondaire, pas une mutation de statut critique.

---

# Plan de remédiation — RadWaste Pro

## 1. Verdict global

**L'application N'EST PAS utilisable en production réelle.** En l'état, n'importe quel compte authentifié (y compris un Manipulateur) peut, via une simple requête Firestore, s'auto-promouvoir administrateur, lire/altérer/supprimer tout le registre réglementaire, falsifier la piste d'audit, et le critère de libération radiophysique est physiquement erroné (activité totale MBq au lieu d'activité massique Bq/g, sans contrôle des 10 périodes ni du débit de dose). Sur une application médicale revendiquant la conformité ASN, c'est disqualifiant.

**Note de maturité : 4/20.** Le socle fonctionnel et l'UI existent, mais les 10 P0 touchent simultanément l'autorisation serveur, l'exactitude radiophysique, l'inviolabilité du registre et la perte de données — les quatre piliers réglementaires sont absents.

---

## 2. Phase 0 — Bloquants sécurité/sûreté (P0)

> À corriger **avant tout usage réel**. Tant que cette phase n'est pas close, l'app ne doit toucher aucune donnée patient/déchet réelle.

### Bloc A — Réécriture complète des règles Firestore (SEC-01, SEC-02, SEC-03, SEC-04, REG-03)

**Problème (1 ligne) :** `firestore.rules:52-66` protège les 4 collections par le seul `allow read, write: if isSignedIn()` ; les fonctions de validation `isValid*` (l.24-50) sont du code mort ; aucun contrôle de rôle, de `hospitalId`, ni d'inviolabilité des logs.

**Correctif concret :** réécrire chaque bloc `match`. Le rôle doit venir d'un **custom claim** (posé par Cloud Function admin), pas du document `users` (sinon SEC-03 persiste). Exemple cible :

```
function isSignedIn() { return request.auth != null; }
function sameHospital(data) { return data.hospitalId == request.auth.token.hospitalId; }
function isAdmin() { return request.auth.token.role == 'Administrateur'; }

match /wasteItems/{id} {
  allow read:   if isSignedIn() && sameHospital(resource.data);
  allow create: if isSignedIn() && isValidWasteItem(incoming()) && sameHospital(incoming());
  allow update: if isSignedIn() && isValidWasteItem(incoming()) && sameHospital(resource.data)
                   && incoming().id == resource.data.id;        // id immuable
  allow delete: if isAdmin() && sameHospital(resource.data);
}
match /users/{userId} {
  allow read:   if isSignedIn() && sameHospital(resource.data);
  // interdire à un user de toucher son propre role/permissions
  allow write:  if isAdmin() && sameHospital(incoming());
}
match /logs/{id} {                                              // REG-03 : append-only
  allow read:   if isSignedIn() && sameHospital(resource.data);
  allow create: if isSignedIn() && incoming().userEmail == request.auth.token.email
                   && incoming().date == request.time;          // horodatage serveur imposé
  allow update, delete: if false;
}
```

- Brancher les `isValidWasteItem/isValidIncident/isValidUser` existants (SEC-02).
- Forcer `hospitalId` côté serveur via claim (SEC-04) — ne plus traiter `'default-hospital'` codé en dur comme une frontière.
- Logs : `serverTimestamp()` côté client + `incoming().date == request.time` côté règle (REG-03).

**Effort : L** (réécriture règles + mise en place des custom claims via Cloud Function + adaptation des écritures client à `serverTimestamp`).

### SEC-05 — Appliquer réellement le RBAC

**Problème :** `permissions[]` est calculé (`page.tsx:1337-1340`) et seulement affiché (l.1461-1466) ; la seule garde (`if (!currentUserProfile)`, l.296) ne filtre pas par rôle. Toutes les vues/actions sont rendues inconditionnellement (NavButton l.397-409, vues l.444-470).

**Correctif :** (1) côté UI, conditionner `NavButton` "Gestion Utilisateurs" et la vue `SettingsView` (backup/restore) à `currentUserProfile.role === 'Administrateur'` ; (2) la **vraie** garde est serveur (Bloc A). L'UI ne fait que masquer ; les règles imposent.

**Effort : M.**

### SEC-06 — Supprimer le bootstrap admin côté client

**Problème :** email super-admin codé en dur (`page.tsx:73, 203`) ; auto-création du compte Auth (l.207) et du doc `users` avec `role:'Administrateur', permissions:['admin_complet']` (l.86-87) sur simple présentation de l'email.

**Correctif :** retirer les deux vecteurs (l.73-91 et l.203-214). Provisionner l'admin **une seule fois** via console Firebase / Admin SDK, et poser le rôle en **custom claim**. Aucune identité privilégiée en dur dans le code client.

**Effort : S** (suppression code) **+ M** (procédure de provisioning Admin SDK).

### REG-01 — Critère de libération conforme (activité massique + 10 périodes + débit de dose)

**Problème :** `handleCheckThresholds` (l.818-846) libère dès que `residual <= w.regulatoryClearanceLevel` (l.824), où `residual` = activité **totale** MBq (`calculateResidual` l.598-602). Le seuil est en MBq (label l.751, `types.ts:20`), pas en Bq/g. Aucun contrôle du nombre de périodes ni du débit de dose.

**Correctif :** remplacer le critère unique par une combinaison à 3 conditions, **toutes** requises :
1. activité **massique** = activité résiduelle / masse du colis, comparée au niveau de libération **Bq/g par radionucléide** (table de référence) ;
2. temps écoulé depuis `measureDate` **≥ 10·T½** ;
3. débit de dose à la sortie comparé au bruit de fond.

Retyper `regulatoryClearanceLevel` en Bq/g, ajouter un champ `mass`, créer une table `clearanceLevels[radionuclide]`. Bloquer la transition `liberable` si l'un des trois échoue.

**Effort : L** (modèle + table de référence + logique + données existantes à migrer).

### REG-02 / DATA-07 — Supprimer les défauts radiophysiques silencieux

**Problème :** `halfLife: Number(...) || 6` (l.659, 676 → 6 h forcé si vide **ou 0**), `regulatoryClearanceLevel ... || 0.1` (l.660, 677), `initialActivity ... || 0` (l.655, 672). Pour I-131 (~192 h) ou Lu-177 (~160 h) mal saisi, la décroissance est calculée sur 6 h → libération prématurée d'un déchet actif. `doseRateBefore/After` sans `||` → `NaN` persisté (incidents).

**Correctif :** supprimer tous les `|| 6`, `|| 0.1`, `|| 0` sur les champs radiophysiques. Ajouter une validation numérique dans `handleSubmit` (l.643) : rejeter si `halfLife <= 0`, `initialActivity <= 0`, `regulatoryClearanceLevel <= 0`, ou valeur non numérique. Pré-remplir `halfLife` depuis la table par radionucléide. Valider `doseRateBefore/After` (pas de NaN).

**Effort : S** (suppression défauts + validation) **/ M** avec la table de T½ de référence.

### DATA-01 / ARCH-09 — Génération d'ID par `length+1` + `setDoc` sans merge

**Problème :** `id: WST-${code}-${wasteItems.length+1}` (l.665) puis `setDoc(doc(db,'wasteItems',id), item)` (l.683) ; `INC-2024-${incidents.length+1}` (l.1059) + `setDoc` (l.1069). Après une suppression (`deleteDoc` l.1092/711), `length+1` réattribue un numéro existant → **écrasement silencieux** d'un enregistrement (ex. rapport d'incident de perte/contamination).

**Correctif :** ne jamais dériver l'ID de `array.length`. Utiliser `addDoc` (ID auto Firestore) en stockant le numéro de registre lisible dans un champ séparé calculé par `runTransaction` sur un doc `counters`. À défaut immédiat, `crypto.randomUUID()`. Conditionner l'écriture à l'absence préalable (règle `allow create: if !exists(...)`).

**Effort : M.**

### DATA-02 / SEC-08 / REG-08 — Restauration de sauvegarde non sécurisée

**Problème :** `handleRestore` (l.1513-1543) : `JSON.parse` (l.1522), simple test de présence (l.1523), puis boucle `setDoc` brute (l.1528-1530). Aucune confirmation, aucune validation de schéma (les règles ne valident pas non plus), upsert partiel laissant des orphelins (commentaire "just overwrite" l.1527 ; `deleteDoc` importé l.1525 mais jamais appelé), `actionLogs` jamais restaurés, `hospitalId` non vérifié. Permet de réinjecter un user `admin_complet` (re-escalade).

**Correctif :**
- Restreindre la restauration aux **administrateurs** (UI + règle serveur).
- **Confirmation explicite** (modal "taper CONFIRMER").
- Valider **chaque** enregistrement (schéma, types, `id`, bornes physiques `activity>=0`/`halfLife>0`/`status` dans l'énum, `hospitalId` == celui de l'utilisateur) ; rejeter le fichier entier si un item est invalide.
- Interdire l'écriture de `role/permissions` par cette voie.
- Remplacer la boucle `setDoc` par un **`writeBatch`** atomique ; choisir une sémantique claire (wipe+réécriture complète logs inclus, ou merge documenté).

**Effort : L.**

### UX-01 — Échec silencieux des mutations critiques

**Problème :** la quasi-totalité des écritures finissent en `.catch(err => console.error(...))` sans aucun retour écran ni confirmation de succès (l.176, 661, 683, 720, 940-942, 1056, 1069, 1092, 1402). Un opérateur qui valide une élimination dont la requête échoue (réseau/règle refusée) croit l'opération enregistrée.

**Correctif :** introduire un système de notification (toast/bannière) déclenché dans **chaque** `.then()` (succès) et `.catch()` (échec) des mutations. Généraliser le pattern `errorMsg` déjà présent dans `UsersView` (l.1381). Coupler au verrouillage des boutons (UX-02). Aucune mutation de sûreté ne doit se résoudre uniquement en console.

**Effort : M.**

---

## 3. Phase 1 — Intégrité & conformité (P1)

> Regroupés par thème. À traiter juste après la Phase 0, dont plusieurs P1 sont des conséquences directes (couvertes en partie par le Bloc A des règles).

### Sécurité résiduelle (SEC-09, SEC-10)
- **SEC-09** — création de comptes (y compris `Administrateur`) par tout utilisateur via instance Auth secondaire (`page.tsx:1354-1377`, `lib/firebase.ts:20-22`, FormSelect rôle l.1430). **Correctif :** déplacer la création vers une **Cloud Function** vérifiant que l'appelant est admin, qui crée le compte Auth et pose le rôle via custom claim ; activer App Check ; vérifier que l'auto-inscription email/mdp est restreinte en console. **Effort : L.**
- **SEC-10** — logs modifiables/supprimables (`firestore.rules:64-66`), `userEmail`/`date` posés côté client (l.173-174). **Correctif :** déjà couvert par le Bloc A (append-only + horodatage/identité serveur). **Effort : S** (une fois le Bloc A fait).

### Exactitude radiophysique & registre (REG-04, REG-05, REG-07)
- **REG-05** — contrôle de sortie purement déclaratif : `handleControlSubmit` (l.919-945) passe `status:'elimine'` (l.924) sans aucun test de seuil ; `exitConformity` dérive d'un simple "Oui/Non" (l.927/962). **Correctif :** à la validation, recalculer l'activité massique résiduelle, comparer `exitDoseRate` à un seuil paramétrable, bloquer ou exiger double validation (CRP) si dépassement ; interdire `exitConformity='Oui'` incohérent avec les mesures. **Effort : M.**
- **REG-07** — champs réglementaires manquants (`types.ts:5-37, 41-51`) : masse/volume, niveau de libération Bq/g, périodes écoulées, n° de bordereau/agrément filière, signataire authentifié + horodatage serveur ; `expectedDecayDuration:10` figé (l.680) sans lien avec T½ ; `PrintRegistre` signature manuscrite seule (l.1243). **Correctif :** compléter le modèle ; lier `expectedDecayDuration` à ≥10·T½. **Effort : M** (recouvre partiellement REG-01).
- **REG-04** — footer avec affirmations de conformité figées (l.475-482 : "Conformité ASN/AFNOR: Active-2023.v4", "Capacité 78.4%", "Capteurs: Actifs", heure statique). **Correctif :** supprimer toute mention de conformité non étayée ; retirer les indicateurs factices. **Effort : S.**

### Architecture & qualité (ARCH-01, ARCH-02, ARCH-04, ARCH-05, ARCH-08)
- **ARCH-01 / ARCH-02** — monolithe de 1725 lignes, aucune couche service. **Correctif :** voir §6 (Refactoring). **Effort : L.**
- **ARCH-04** — 68 occurrences `: any`/`as any` neutralisant TS (états l.38/42/58-62, calculs l.598/604/611, casts l.82/653-654/670-671/1051/1349/1368). **Correctif :** typer props de vues, états (`FirebaseUser | null`, `ActionLog[]`, `Unsubscribe`), supprimer les `as any` via parseurs validants ; activer `@typescript-eslint/no-explicit-any`. **Effort : M.**
- **ARCH-05** — 16 `console.error` sans feedback (recoupe UX-01) ; boucle `for...await` du restore non protégée (l.1528-1530). **Correctif :** centraliser la gestion d'erreur dans les repositories ; restore en `writeBatch`. **Effort : M.**
- **ARCH-08** — aucun test (`package.json:5-11`, pas de framework). **Correctif :** extraire les calculs en module pur testable + tests Vitest par isotope (Tc-99m 6h, F-18 1.83h, I-131 192h) et bornes. **Effort : M** (voir §6).

### Accessibilité (A11Y-01, A11Y-02, A11Y-03)
- **A11Y-01** — thème clair via `filter:invert(1)` (`globals.css:3-6`, appliqué `page.tsx:320`) inverse le code couleur de sûreté (rouge→cyan, jaune→bleu) et casse les graphiques recharts (couleurs en dur l.540/555/556). **Correctif :** supprimer le filtre, implémenter un vrai thème par variables CSS avec palette claire (ratio ≥4.5:1) ; à défaut, retirer le bouton de bascule (l.340-343). **Effort : M.**
- **A11Y-02** — aucun attribut a11y dans tout `app/` (0 `aria-`/`role=`/`alt=`). Boutons icône-seuls (l.324-329, 339-344, 346-354), Modifier/Supprimer en `title=` seul (l.797-802, 1141-1146, 1473-1480), ✕ sans label (l.957). **Correctif :** `aria-label` sur tous les boutons icône, `aria-hidden` sur les décoratifs. **Effort : S/M.**
- **A11Y-03** — modale "Contrôle avant Sortie" (l.949-975) : pas de `role=dialog`/`aria-modal`, pas de focus trap, pas de fermeture Escape, overlay sans `onClick`. **Correctif :** modale accessible (Radix Dialog ou équivalent). **Effort : M.**

### Autres P1
- **SEC-06** déjà traité en Phase 0 (vecteur d'escalade).
- **DATA-04** — garde de suppression admin compare un **UID** à un **email** (`page.tsx:1397`), toujours fausse ; seul garde = masquage du bouton (l.1476). **Correctif :** tester `u.email === '...'` dans `handleDelete`, et faire respecter l'invariant côté règles. **Effort : S.**
- **UX-02** — aucun verrou de chargement sur les actions (sauf `DecroissanceView` l.857-861) ; risque de double-clic/double-écriture, surtout sur `handleRestore` (boucle séquentielle, l.1559-1567). **Correctif :** états `isSubmitting`/`isDeleting`/`isRestoring`, bouton `disabled` + libellé pendant l'attente. **Effort : M.**

---

## 4. Phase 2 — Robustesse & architecture (P2)

| ID | Problème (fichier:lignes) | Correctif | Effort |
|----|---------------------------|-----------|--------|
| REG-06 | Pas de gardes numériques dans `calculateResidual`/`getTheoreticalReleaseDate` (`page.tsx:598-616`) : `halfLife=0`→NaN/100%, `initialActivity=0`→Invalid Date ; `totalActivity` (l.156-163) sans garde | Retourner un état "données invalides" si `halfLife<=0` ou `initialActivity<=0` ; centraliser le calcul (recoupe REG-02) | S |
| DATA-03 | Statut `'incident'` déclaré (`types.ts:3`) jamais assigné ; un déchet "perdu" reste 'En Stockage' et compte à l'inventaire | Soit retirer `'incident'` du type, soit implémenter la transition de statut sur incident lié à `wasteId` | S/M |
| DATA-05 | Bouton "mot de passe oublié" conditionné sur une chaîne jamais émise (`page.tsx:261-278`) → code mort | Afficher le lien inconditionnellement ou sur `auth/invalid-credential` | S |
| DATA-06 / UX-04 | Header affiche `users[0]` au lieu de `currentUserProfile` (`page.tsx:373-377`) | Remplacer par `currentUserProfile.name/.role/initiales` | S |
| DATA-08 | `totalActivity` exclut 'liberable' (l.157) ; `nonConformes` mélange non-conformités + incidents (l.154) | Inclure 'stockage'+'liberable' dans l'activité présente ; séparer les deux compteurs | S |
| DATA-09 | Listeners `onSnapshot` dans `.then()` imbriqués, cleanup synchrone, non annulés au changement d'auth (`page.tsx:57-142`) → fuite | Stocker les unsub dans des refs, annuler les précédents en tête du callback `onAuthStateChanged`, flag `isMounted` | M |
| ARCH-03 | 16 imports dynamiques `import('@/lib/firebase')` + 28 `import('firebase/firestore')` | Imports statiques dans la couche repository (voir §6) | M (intégré au refactoring) |
| ARCH-07 / CFG-02 | `eslint.ignoreDuringBuilds:true` (`next.config.ts:5-7`) + double config ESLint (`.eslintrc.json` + `eslint.config.mjs`) | Retirer `ignoreDuringBuilds`, corriger le lint, unifier sur `eslint.config.mjs`, CI bloquante | S/M |
| ARCH-10 | `NuclearWasteApp` vs "RadWaste Pro", `storageResponsible:'Dr. Martin'` figé (l.679), props `setX` mortes, footer factice | Renommer, alimenter `storageResponsible` depuis le profil, supprimer props mortes | S/M |
| CFG-01 | `firebase-applet-config.json` (apiKey) committé (importé `lib/firebase.ts:4`), non couvert par `.gitignore` | `git rm --cached`, ajouter au `.gitignore`, purger l'historique, config via `NEXT_PUBLIC_*`, restreindre la clé + App Check | S |
| CFG-03 | `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` (`metadata.json:5`) + `GEMINI_API_KEY` exigée alors qu'aucun code n'utilise Gemini | Retirer la capacité, la dépendance `@google/genai`, et purger README/`.env.example` | S |
| CFG-06 | Aucun test/CI, pas de `firebase.json`/`.firebaserc` alors que `firestore.rules` est tracké | Ajouter tests + CI (lint/typecheck/test/build), `firebase.json`+`.firebaserc`, documenter `firebase deploy --only firestore:rules` | M |
| I18N-01 | `<html lang="en">` sur app FR (`layout.tsx:11`) | `lang="fr"` | S |
| I18N-02 | Titre `'My Google AI Studio App'` (`layout.tsx:4-7`) | Titre/description RadWaste FR (réutiliser `metadata.json`) | S |
| A11Y-04 | Tailles `text-[9px]`/`text-[10px]` sur données métier (l.782, 786, 790, 1007, 1464, 570…) | Relever à `text-xs` (12px) minimum pour toute donnée, augmenter contraste | S |
| UX-03 | `select-none` global (l.232, 298, 320) empêche de copier IDs/doses/email support (l.1646) | Retirer le `select-none` global, le cibler sur les seuls libellés de nav | S |

---

## 5. Phase 3 — Polish UX/qualité (P3)

| ID | Problème (fichier:lignes) | Correctif | Effort |
|----|---------------------------|-----------|--------|
| SEC-07 | Config Firebase web committée (`firebase-applet-config.json:1-10`, `.gitignore:6-7`) — doublon de gouvernance avec CFG-01 (clé web non secrète) | Traité avec CFG-01 | S |
| ARCH-06 | Imports morts (`mockWaste`/`differenceInHours` `page.tsx:4,6`), deps mortes (`@google/genai`, `@hookform/resolvers`, `motion`, `clsx/cva/tailwind-merge` via `lib/utils.ts`) | Supprimer imports morts, désinstaller deps, activer `no-unused-vars` | S |
| CFG-04 | Deps déclarées jamais utilisées (`package.json:13-27`), `transpilePackages:['motion']` (`next.config.ts:23`) | Retirer deps + entrée transpile, régénérer lockfile | S |
| CFG-05 | `remotePatterns` `picsum.photos` (`next.config.ts:11-21`) sans aucune image distante | Supprimer le bloc `images.remotePatterns` | S |
| CFG-07 | Nom package `"ai-studio-applet"` (`package.json:2`), bannière README gabarit | Renommer package, README propre au produit | S |
| CFG-08 | Imports morts `signInWithEmailAndPassword`/`createUserWithEmailAndPassword` (`lib/firebase.ts:2`) | Retirer (réactivés par le lint une fois CFG-02 fait) | S |
| UX-05 | Tableaux sans état vide (l.579, 776, 877, 989, 1132, 1452) | Ajouter un message "Aucun déchet…" distinct d'une erreur de chargement | S |
| UX-06 | Données factices affichées comme réelles (footer figé l.478-480, header l.335-336, `storageResponsible:'Dr. Martin'` l.679, préférences `onChange={() => {}}` l.1574-1575) | Rendre dynamiques ou supprimer ; `storageResponsible` depuis le profil | S |

---

## 6. Refactoring recommandé (architecture cible)

Le monolithe `app/page.tsx` (1725 lignes, `'use client'`) est la cause structurelle de la non-testabilité (ARCH-01/02/03/04/05/08/09). Cible :

```
lib/
  firebase.ts                 # init unique, imports statiques (supprime ARCH-03)
  physics/
    decay.ts                  # calculateResidual, decayPercentage, releaseDate — PURS, typés, gardés (REG-01/02/06)
    clearanceLevels.ts        # table Bq/g + T½ de référence par radionucléide (REG-01/02/07)
  repositories/
    wasteRepository.ts        # listByHospital, create(addDoc), update, remove, releaseBatch (ARCH-02)
    incidentRepository.ts
    userRepository.ts
    logRepository.ts          # create-only, serverTimestamp (REG-03)
  validation/
    schemas.ts                # parseurs/validateurs réutilisés UI + restore (DATA-02, REG-02)
app/
  (routes)/dashboard, identification, decroissance, sortie, incidents, reports, users, settings, help
components/                   # DataTable, EntityForm, FormInput/Select, KPICard, Modal accessible (A11Y-03), Toast (UX-01)
  guards/RoleGuard.tsx        # RBAC UI (SEC-05)
functions/                    # Cloud Functions : createUser admin-only + custom claims (SEC-06/09), setRole
firestore.rules               # RBAC + hospitalId + validation + logs append-only (Bloc A)
firebase.json, .firebaserc    # déploiement des règles (CFG-06)
```

Principes :
- **Calculs radiophysiques purs et testés** : `lib/physics/` ne dépend pas de React/Firestore → tests Vitest par isotope et bornes (REG-01/02/06, ARCH-08).
- **Couche repository** : seul point d'accès Firestore, imports statiques, gestion d'erreur + logging centralisés (ARCH-02/03/05).
- **Typage strict** : interfaces de props par vue, suppression des `any`/`as any`, `no-explicit-any` activé (ARCH-04).
- **Rôle = custom claim** (jamais le doc `users` comme source de vérité) : ferme SEC-03/06/09 de façon serveur.
- **Fichiers < 300 lignes.**

---

## 7. Ordre d'exécution conseillé (sprints)

**Sprint 0 — "Cadenas serveur" (P0 sécurité, prérequis de tout le reste)**
1. `firestore.rules` réécrites (Bloc A : RBAC + hospitalId + validation + logs append-only) — SEC-01/02/03/04, REG-03, SEC-10.
2. Cloud Function de provisioning admin + `setCustomUserClaims` (role/hospitalId) ; suppression du bootstrap client — SEC-06.
3. `firebase.json`/`.firebaserc` + procédure `firebase deploy --only firestore:rules` (sans déploiement de règles, le code reste exploitable) — CFG-06.

**Sprint 1 — "Exactitude radiophysique" (P0 sûreté)**
4. Extraire `lib/physics/decay.ts` + `clearanceLevels.ts`, supprimer les défauts `|| 6/|| 0.1/|| 0`, ajouter validation — REG-02/06, DATA-07.
5. Réécrire le critère de libération (massique + 10 périodes + débit de dose) — REG-01, REG-05.
6. Tests Vitest des calculs — ARCH-08 (commencé).

**Sprint 2 — "Intégrité des données" (P0 données)**
7. IDs via `addDoc`/`runTransaction` au lieu de `length+1` — DATA-01, ARCH-09.
8. `handleRestore` : RBAC admin + confirmation + validation + `writeBatch` atomique — DATA-02/SEC-08/REG-08.
9. Toasts succès/échec sur toutes les mutations + verrous de chargement — UX-01, UX-02.

**Sprint 3 — "RBAC bout-en-bout & comptes" (P1)**
10. RBAC UI (`RoleGuard`) — SEC-05 ; correction `handleDelete` (email vs UID) — DATA-04.
11. Cloud Function de création d'utilisateurs admin-only — SEC-09.

**Sprint 4 — "Découpage monolithe & typage" (P1 archi)**
12. Repositories Firestore + imports statiques — ARCH-02/03/05.
13. Découpage en vues/composants, typage strict, suppression des `any` — ARCH-01/04.
14. Activer ESLint au build + CI bloquante (lint/typecheck/test/build) — ARCH-07/CFG-02/CFG-06.

**Sprint 5 — "Conformité & accessibilité visible" (P1)**
15. Champs réglementaires manquants + signature/horodatage serveur — REG-07 ; retirer footer factice — REG-04.
16. Thème clair réel, attributs a11y, modale accessible — A11Y-01/02/03.

**Sprint 6 — "Robustesse & polish" (P2/P3)**
17. P2 restants : DATA-03/05/06/08/09, ARCH-10, CFG-01/03, I18N-01/02, A11Y-04, UX-03.
18. P3 : nettoyage deps mortes, config morte, états vides, données factices — ARCH-06, CFG-04/05/07/08, UX-05/06, SEC-07.

**Règle de gate :** aucun usage sur données réelles avant la clôture **complète** des Sprints 0 à 2 (les 10 P0). Les Sprints 3+ peuvent se mener en parallèle de premiers pilotes en environnement de test cloisonné.

---

Fichiers vérifiés et cités : `C:\Users\agbot\Desktop\radwaste\firestore.rules`, `C:\Users\agbot\Desktop\radwaste\lib\firebase.ts`, `C:\Users\agbot\Desktop\radwaste\types.ts`, `C:\Users\agbot\Desktop\radwaste\next.config.ts`, `C:\Users\agbot\Desktop\radwaste\app\page.tsx` (sections auth/listeners l.57-186, calculs l.598-616, identification l.618-689, décroissance/seuils l.815-905, contrôle sortie l.907-945, backup/restore l.1496-1543). Tous les constats du JSON sont confirmés conformes au code.