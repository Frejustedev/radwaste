'use client';

import React from 'react';
import {
  LifeBuoy, PackageCheck, Activity, ClipboardCheck, AlertTriangle, BarChart3,
  FileText, Settings, Users, BookOpen, ShieldAlert, Mail,
} from 'lucide-react';
import { SectionHeader } from '@/components/ui/Primitives';

/**
 * Vue d'aide & documentation de RadWaste IMENA.
 * Contenu statique uniquement — aucune mutation, aucune prop.
 */

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 border-b border-subtle pb-2 text-base font-semibold text-primary">
        <span className="text-accent" aria-hidden="true">{icon}</span>
        {title}
      </h3>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export function HelpView() {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Aide & Documentation"
        description="Guide complet d'utilisation de la gestion des déchets radioactifs."
      />

      {/* Avertissement réglementaire */}
      <div className="rounded-2xl border border-yellow-400/40 bg-yellow-400/10 p-5 flex items-start gap-3">
        <ShieldAlert className="h-6 w-6 text-accent shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-sm text-primary leading-relaxed">
          <p className="font-bold">Avertissement réglementaire</p>
          <p className="mt-1 text-muted">
            Les seuils de libération (activité massique en Bq/g) et le seuil de débit de dose de sortie sont fournis
            à titre <strong>indicatif</strong>. Ils doivent être <strong>validés par la Personne Compétente en
            Radioprotection (PCR) / le physicien médical</strong> au regard de la réglementation en vigueur (ASN,
            Directive 2013/59/Euratom) <strong>avant tout usage clinique</strong>.
          </p>
        </div>
      </div>

      <div className="bg-surface border border-subtle rounded-2xl p-6 space-y-8">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-accent/10 p-3 text-accent">
            <LifeBuoy className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-primary">Cycle de vie d&apos;un déchet</h2>
            <p className="text-sm text-muted">
              Identification → Stockage → Décroissance → Contrôle de sortie → Élimination, avec traçabilité complète.
            </p>
          </div>
        </div>

        <Section icon={<PackageCheck className="h-5 w-5" />} title="1. Identification & Stockage">
          <p>
            Enregistrez chaque déchet dès sa production. <strong>Seuls le type de déchet et le radionucléide sont
            obligatoires</strong> : tous les autres champs (activité initiale, masse, date de mesure, demi-vie, débits
            de dose, service d&apos;origine, opérateur) peuvent être laissés vides et <strong>complétés plus tard</strong>
            via le bouton « Modifier ».
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>La <strong>demi-vie physique se remplit automatiquement</strong> lorsque vous choisissez le radionucléide (valeur de référence). Choisissez « autres » pour la saisir manuellement.</li>
            <li>La <strong>masse</strong> et l&apos;<strong>activité initiale</strong> sont nécessaires au calcul de l&apos;activité massique (donc à la libération automatique).</li>
            <li>Chaque déchet reçoit un <strong>numéro de registre unique</strong> et une date d&apos;entrée en stockage.</li>
          </ul>
        </Section>

        <Section icon={<Activity className="h-5 w-5" />} title="2. Suivi de Décroissance">
          <p>
            Le système recalcule en continu l&apos;activité résiduelle de chaque déchet (loi A = A₀·0,5^(t/T½)).
            Un déchet devient <strong>« libérable »</strong> uniquement lorsque <strong>deux critères sont réunis</strong> :
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>son <strong>activité massique</strong> (Bq/g) est passée <strong>sous le seuil de libération</strong> réglementaire du radionucléide ;</li>
            <li><strong>au moins 10 périodes</strong> (demi-vies) se sont écoulées depuis la mesure de référence.</li>
          </ul>
          <p>
            Une <strong>alerte automatique</strong> (bannière jaune + indicateur « Seuil atteint ») signale les déchets prêts.
            Le bouton <strong>« Vérifier les Seuils »</strong> fait passer au statut « libérable » les déchets <strong>encore
            en stockage</strong> qui remplissent les critères. Les déchets déjà « libérables » se traitent ensuite dans
            « Sortie & Élimination » (le bouton n&apos;agit donc que sur les nouveaux candidats).
          </p>
        </Section>

        <Section icon={<ClipboardCheck className="h-5 w-5" />} title="3. Contrôle de Sortie & Élimination">
          <p>
            Avant toute élimination, la sortie est validée par une <strong>nouvelle mesure du débit de dose au contact</strong>
            (qui doit être ≤ au seuil opérationnel). Vous renseignez le <strong>mode d&apos;élimination</strong>, le
            <strong> contrôleur</strong> et la date <strong>« Libéré le »</strong>.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Le champ <strong>« Libéré le »</strong> vaut par défaut la date du jour mais reste <strong>modifiable</strong> — pratique pour enregistrer d&apos;anciens déchets du registre avec leur date réelle de sortie.</li>
            <li>Si un critère n&apos;est pas satisfait, une <strong>dérogation sous responsabilité de la PCR</strong> doit être confirmée explicitement ; la sortie est alors marquée « non conforme ».</li>
            <li>La validation porte une <strong>signature électronique</strong> : l&apos;e-mail du compte connecté et l&apos;horodatage serveur sont enregistrés de façon inviolable.</li>
          </ul>
        </Section>

        <Section icon={<AlertTriangle className="h-5 w-5" />} title="4. Gestion des Incidents">
          <p>
            Déclarez tout incident (déversement accidentel, contamination, perte de déchet) en précisant le type ;
            les autres champs (personne concernée, débits de dose avant/après action corrective, actions menées)
            sont facultatifs et complétables ultérieurement. Un incident peut être rattaché à un déchet précis.
          </p>
        </Section>

        <Section icon={<BarChart3 className="h-5 w-5" />} title="5. Tableau de Bord">
          <p>Vue d&apos;ensemble en temps réel. Les indicateurs (survolez-les pour leur définition) :</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>En stockage</strong> : déchets en cours de décroissance.</li>
            <li><strong>Activité totale (MBq)</strong> : somme des activités résiduelles (stockage + libérables).</li>
            <li><strong>Libérables</strong> : déchets ayant atteint les critères, en attente de contrôle de sortie.</li>
            <li><strong>Non conformes</strong> : déchets <strong>sortis sous dérogation</strong> (un critère réglementaire non satisfait, validé par la PCR). À distinguer des incidents.</li>
            <li><strong>Incidents</strong> : incidents déclarés.</li>
          </ul>
        </Section>

        <Section icon={<FileText className="h-5 w-5" />} title="6. Rapports & Registres">
          <p>Génération de documents réglementaires imprimables (PDF via l&apos;impression du navigateur) :</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Registre réglementaire</strong> : historique complet de tous les déchets.</li>
            <li><strong>Rapport mensuel / annuel</strong> : éliminations sur une période sélectionnable (synthèse par radionucléide pour l&apos;annuel).</li>
            <li><strong>Inventaire du stock</strong> : déchets présents avec activité résiduelle et date de libération prévue.</li>
          </ul>
          <p>Les tableaux des modules proposent aussi un <strong>export CSV</strong> (compatible Excel) et la recherche/tri/pagination.</p>
        </Section>

        <Section icon={<Settings className="h-5 w-5" />} title="7. Paramètres (administrateur)">
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Listes paramétrables</strong> : ajoutez/supprimez les services d&apos;origine, types de déchets, modes d&apos;élimination et types d&apos;incidents. Les changements s&apos;appliquent immédiatement à tous les formulaires.</li>
            <li><strong>Sauvegarde & restauration</strong> : exportez la base en JSON, restaurez après confirmation explicite (le journal d&apos;audit n&apos;est pas restauré, il est inviolable).</li>
            <li><strong>Journal d&apos;actions</strong> : piste d&apos;audit horodatée côté serveur, recherchable et exportable.</li>
          </ul>
        </Section>

        <Section icon={<Users className="h-5 w-5" />} title="8. Gestion des Utilisateurs & Rôles">
          <p>
            L&apos;administrateur crée les comptes et attribue un rôle (Administrateur, Médecin nucléaire,
            Radiopharmacien, Manipulateur, Physicien médical, Conseiller en radioprotection). Les modules
            « Gestion Utilisateurs » et « Paramètres » sont réservés aux administrateurs. Chaque accès et chaque
            action sont tracés et cloisonnés par établissement.
          </p>
        </Section>

        <Section icon={<BookOpen className="h-5 w-5" />} title="Glossaire">
          <ul className="space-y-1.5">
            <li><strong>Activité résiduelle</strong> : activité restante d&apos;un déchet à l&apos;instant présent, après décroissance (MBq).</li>
            <li><strong>Activité massique</strong> : activité par unité de masse (Bq/g) — c&apos;est elle qui est comparée au seuil de libération.</li>
            <li><strong>Période (demi-vie)</strong> : durée au bout de laquelle l&apos;activité est divisée par deux.</li>
            <li><strong>Seuil de libération</strong> : activité massique (Bq/g) en dessous de laquelle un déchet peut être libéré de la zone contrôlée.</li>
            <li><strong>Libérable</strong> : déchet ayant atteint les critères (activité massique sous le seuil + ≥ 10 périodes).</li>
            <li><strong>Non conforme</strong> : déchet sorti par dérogation alors qu&apos;un critère n&apos;était pas satisfait.</li>
            <li><strong>PCR</strong> : Personne Compétente en Radioprotection.</li>
          </ul>
        </Section>

        <Section icon={<Mail className="h-5 w-5" />} title="Support">
          <p>
            Pour toute question, contactez l&apos;administrateur de votre établissement. Support technique de
            l&apos;application :{' '}
            <a href="mailto:support@imena-gest.net" className="text-accent underline underline-offset-2">
              support@imena-gest.net
            </a>.
            Ressources : {' '}
            <a href="https://imena-gest.net" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">imena-gest.net</a>
            {' · '}
            <a href="https://imena.ci" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">imena.ci</a>.
          </p>
        </Section>
      </div>
    </div>
  );
}
