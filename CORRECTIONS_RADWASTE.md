# RadWaste Pro — Rapport de corrections

Remédiation complète des 57 constats de l'audit ([AUDIT_RADWASTE.md](AUDIT_RADWASTE.md)).
Vérifié : `npm run typecheck` ✓ · `npm run test` (19/19) ✓ · `npm run lint` (0 erreur, 0 warning) ✓ · `npm run build` ✓ · serveur HTTP 200 ✓.

## Vue d'ensemble

L'application monolithique (1 fichier de 1725 lignes) a été refondue en modules testables (< 300 lignes),
et les 4 piliers réglementaires manquants ont été rétablis :

| Pilier | Avant | Après |
|---|---|---|
| Autorisation serveur | `if isSignedIn()` partout | RBAC + cloisonnement `hospitalId` + validation de schéma dans `firestore.rules` |
| Exactitude radiophysique | seuil sur activité totale, défauts dangereux | activité massique (Bq/g) + règle des 10 périodes + débit de dose, module pur testé |
| Inviolabilité du registre | logs modifiables, horodatage client | logs **append-only**, horodatage serveur imposé |
| Intégrité des données | IDs `length+1` (écrasement), restore non validée | IDs uniques, restauration validée + atomique + confirmée |

## Nouvelle architecture

```
app/page.tsx                  Coquille slim (auth, nav RBAC, thème)
app/layout.tsx                lang="fr", titre, ToastProvider
components/ui/                Toast, Modal accessible, Form, Primitives
components/views/             9 vues métier (une par module)
lib/physics/                  decay.ts + clearanceLevels.ts (purs) + decay.test.ts (19 tests)
lib/repositories/             waste / incident / user / log / backup (accès Firestore centralisé)
lib/validation/schemas.ts     validation saisies + sauvegardes
lib/hooks/useRadwasteData.ts  session + abonnements (nettoyage déterministe)
lib/permissions.ts            helpers RBAC
firestore.rules               règles durcies
functions/                    Cloud Functions (createUser/setUserRole/deleteUser, admin-only)
scripts/seed-admin.mjs        provisioning du 1er administrateur
firebase.json / .firebaserc   déploiement
```

## Traçabilité des 57 constats

### P0 — Critiques (10/10 corrigés)
| ID | Résolution |
|---|---|
| SEC-01 | `firestore.rules` réécrites : auth + `hospitalId` + RBAC + validation, refus par défaut. |
| SEC-03 | Un utilisateur ne peut plus modifier son propre `role`/`permissions` (règle `update` de `/users`). |
| SEC-04 | `hospitalId` imposé côté serveur sur lecture/création/màj de chaque collection. |
| SEC-05 | RBAC appliqué : nav `users`/`settings` réservée à l'admin (`lib/permissions.ts`) + règles serveur. |
| REG-01 | Critère de libération = activité massique ≤ seuil Bq/g **ET** ≥ 10 périodes (`lib/physics/decay.ts`). |
| REG-02 | Suppression des défauts `\|\|6`/`\|\|0.1`/`\|\|0` ; validation stricte (`validateWasteForm`). |
| REG-03 | Logs `append-only`, `date == request.time` (serverTimestamp), `userEmail` = jeton. |
| DATA-01 | IDs techniques uniques (`doc(collection)`) + `registryNumber` lisible (`repositories/ids.ts`). |
| DATA-02 | Restore : `validateBackup` (rejet global si 1 item invalide) + confirmation + `writeBatch`. |
| UX-01 | Toutes les mutations renvoient un toast succès/échec (`components/ui/Toast.tsx`). |

### P1 — Élevés (20/20 traités)
| ID | Résolution |
|---|---|
| SEC-02 | Validateurs `isValid*` réellement appelés dans les règles. |
| SEC-06 | Backdoor admin (email codé en dur, auto-création) **supprimée** ; seed via `scripts/seed-admin.mjs`. |
| SEC-08 / REG-08 | Restore admin-only, validée, atomique, journal non réinjecté (append-only). |
| SEC-09 | Création de comptes admin-only (règles) ; Cloud Function `createUser` fournie (voie recommandée). |
| SEC-10 | Logs non modifiables/supprimables. |
| REG-04 | Footer aux indicateurs inventés supprimé. |
| REG-05 | Contrôle de sortie : seuil de débit de dose imposé, dérogation PCR tracée (`SortieView`). |
| REG-07 | Ajout `mass` (g) + niveau Bq/g + `registryNumber` (voir limites ci-dessous). |
| DATA-04 | Garde de suppression sur `u.id === profile.id` (plus de comparaison UID↔email). |
| DATA-07 | `parsePositiveNumber` ; saisies invalides rejetées explicitement. |
| ARCH-01/02 | Monolithe découpé ; couche `repositories/`. |
| ARCH-04 | Typage strict, **0 `any`** (lint `no-explicit-any` activé). |
| ARCH-05 | Erreurs remontées à l'utilisateur (toasts), plus de `console.error` muet. |
| ARCH-08 | Tests Vitest des calculs (19 tests). |
| UX-02 | États de chargement (`isSubmitting`/`isDeleting`/`isWorking`) sur chaque action. |
| A11Y-01 | Vrai thème clair/sombre par variables CSS (fini `filter: invert`). |
| A11Y-02 | `aria-label`, `aria-hidden`, focus visible. |
| A11Y-03 | `Modal` accessible (role=dialog, focus trap, Échap, restitution du focus). |

### P2 — Moyens (19/19 traités)
REG-06 (gardes numériques dans les calculs) · DATA-05 (lien mot de passe oublié toujours affiché) ·
DATA-06/UX-04 (en-tête = profil connecté) · DATA-08 (activité résiduelle inclut « libérable », compteurs séparés) ·
DATA-09 (abonnements nettoyés proprement) · ARCH-03 (imports Firebase statiques) ·
ARCH-07/CFG-02 (ESLint actif au build, config unifiée) · ARCH-09 (formulaires/tables factorisés) ·
ARCH-10 (nommage, valeurs dynamiques) · I18N-01 (`lang="fr"`) · I18N-02 (titre personnalisé) ·
A11Y-04 (police ≥ 12px) · UX-03 (`select-none` retiré) · CFG-01 (config Firebase dé-trackée + `.gitignore`) ·
CFG-03 (capacité/clé Gemini retirées) · CFG-06 (`firebase.json`/`.firebaserc` + scripts test).

### P3 — Mineurs (8/8 traités)
SEC-07 (=CFG-01) · ARCH-06 (imports/deps morts retirés) · UX-05 (`EmptyState` partout) ·
UX-06 (données factices supprimées) · CFG-04 (`@google/genai`, `@hookform/resolvers`, `motion` désinstallés) ·
CFG-05 (`remotePatterns` retiré) · CFG-07 (package `radwaste-pro`, titre, README refaits) · CFG-08 (`lib/firebase.ts` nettoyé).

## Déploiement (obligatoire avant usage réel)

1. `firebase deploy --only firestore:rules` — sans cela la base reste ouverte.
2. `node scripts/seed-admin.mjs <email> <mdp> "<Nom>" <hospitalId>` — crée le 1er administrateur.
3. (Recommandé) `cd functions && npm install && firebase deploy --only functions` + activer **App Check**.

## Limites connues / suites recommandées

- **Valeurs réglementaires à valider** : les seuils de `lib/physics/clearanceLevels.ts` (Bq/g, débit de dose)
  sont indicatifs (Euratom 2013/59) et **doivent être validés par la PCR / le physicien médical**.
- **REG-07 (partiel)** : `mass` et niveau Bq/g ajoutés ; champs n° de bordereau / agrément de filière à compléter
  si exigés par le registre local.
- **SEC-09** : la création de comptes reste possible côté client (admin-only via les règles) ; migrer vers la
  Cloud Function `createUser` + custom claims pour une garantie purement serveur.
- **CI** : scripts `lint`/`typecheck`/`test`/`build` prêts — reste à brancher un workflow CI (ex. GitHub Actions).
- **DATA-03** : le statut `'incident'` reste déclaré mais non assigné (sans effet de bord).
