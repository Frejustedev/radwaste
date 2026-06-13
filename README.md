# RadWaste IMENA

Application de gestion des déchets radioactifs en médecine nucléaire : identification & stockage,
suivi de décroissance, contrôle de sortie & élimination, registre d'incidents, rapports réglementaires.

> **Stack :** Next.js 15 (App Router) · React 19 · TypeScript · Firebase (Auth + Firestore) · Tailwind v4 · Recharts.

---

## ⚠️ Avertissement réglementaire

Les niveaux de libération (activité massique en Bq/g) et le seuil de débit de dose de sortie sont
définis dans [`lib/physics/clearanceLevels.ts`](lib/physics/clearanceLevels.ts) à titre **indicatif**.
Ils **doivent être validés par la Personne Compétente en Radioprotection (PCR) / le physicien médical**
au regard de la réglementation en vigueur (ASN, Directive 2013/59/Euratom) **avant tout usage opérationnel**.

---

## Prérequis

- Node.js 20+
- Un projet Firebase (Authentication e-mail/mot de passe + Firestore activés)

## Installation

```bash
npm install
cp .env.example .env.local   # puis renseignez vos variables NEXT_PUBLIC_FIREBASE_*
npm run dev
```

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run typecheck` | Vérification TypeScript (`tsc --noEmit`) |
| `npm run lint` | ESLint |
| `npm run test` | Tests unitaires (Vitest) — calculs radiophysiques |

## Sécurité — étapes de déploiement obligatoires

1. **Déployer les règles Firestore** (le cœur de la sécurité — sans elles, la base est ouverte) :
   ```bash
   firebase deploy --only firestore:rules
   ```
2. **Créer le premier administrateur** (l'auto-création d'admin a été supprimée) :
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/chemin/serviceAccountKey.json
   node scripts/seed-admin.mjs admin@etablissement.fr "MotDePasseFort" "Nom Admin" default-hospital
   ```
3. **(Recommandé)** Déployer les Cloud Functions pour la gestion des comptes via custom claims :
   ```bash
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```
4. **(Recommandé)** Activer **Firebase App Check** sur le projet.

### Modèle de sécurité

- **Autorisation serveur** : [`firestore.rules`](firestore.rules) impose l'authentification, le
  cloisonnement par `hospitalId`, un RBAC par rôle, la validation de schéma, et rend le journal
  d'audit **append-only** (horodatage serveur, non modifiable/supprimable).
- **Anti-escalade** : un utilisateur ne peut pas modifier son propre `role`/`permissions`. La
  création de comptes est réservée aux administrateurs (idéalement via la Cloud Function `createUser`).

## Architecture

```
app/                      Coquille (auth, navigation, thème) + layout
components/ui/            Toast, Modal accessible, formulaires, primitives
components/views/         Une vue par module métier
lib/physics/              Calculs radiophysiques PURS + table de référence (+ tests)
lib/repositories/         Accès Firestore centralisé (IDs sans collision, batchs atomiques)
lib/validation/           Validation des saisies et des sauvegardes
lib/hooks/                Session + abonnements temps réel (nettoyage déterministe)
functions/                Cloud Functions (provisioning de comptes)
scripts/                  Seed du premier administrateur
firestore.rules           Règles de sécurité
```
