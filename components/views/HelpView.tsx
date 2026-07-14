'use client';

import React from 'react';
import {
  LifeBuoy, PackageCheck, Activity, ClipboardCheck, AlertTriangle, BarChart3,
  FileText, Settings, Users, BookOpen, ShieldAlert, Mail, Calculator,
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

/** Formule du dictionnaire de données, présentée telle qu'elle est appliquée par le calcul. */
function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-subtle bg-surface-2 px-3 py-2 font-mono text-xs text-primary">
      {children}
    </div>
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
            Un déchet devient <strong>« libérable »</strong> dès qu&apos;<strong>au moins l&apos;un des deux critères</strong> est rempli :
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>son <strong>activité massique</strong> (Bq/g) est passée <strong>sous le seuil de libération</strong> réglementaire du radionucléide ;</li>
            <li><strong>ou</strong> <strong>au moins 10 périodes</strong> (demi-vies) se sont écoulées depuis la mesure de référence.</li>
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
            (seuil de libération recommandé : <strong>&lt; 0,5 µSv/h</strong>). Vous renseignez le <strong>mode d&apos;élimination</strong>, le
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
            <li><strong>Registre réglementaire</strong> : historique complet de tous les déchets, avec masses, activité massique et verdict de conformité calculé.</li>
            <li><strong>Rapport mensuel / annuel</strong> : éliminations sur une période sélectionnable (synthèse par radionucléide pour l&apos;annuel), suivies des <strong>fiches de preuve de conformité</strong> — une par déchet.</li>
            <li><strong>Inventaire du stock</strong> : déchets présents avec activité résiduelle, activité massique, t_lib et date de libération prévue.</li>
          </ul>
          <p>
            Les fiches de preuve reprennent toutes les mesures relevées (masse brute, tare, masse nette, bruit de fond,
            débits de dose d&apos;entrée et de sortie au contact et à 1 m) et tous les indicateurs calculés (activité
            massique, niveau de libération, t_lib, durée de stockage, indice de conformité, verdict). Une donnée non
            relevée laisse la case vide (un tiret) : <strong>aucune valeur n&apos;est présumée</strong>, jamais un zéro
            (voir §9).
          </p>
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

        <Section icon={<Calculator className="h-5 w-5" />} title="9. Champs de mesure & formules de conformité">
          <p>
            Le <strong>dictionnaire de données v2</strong> impose une chaîne de calcul complète, de la pesée du colis
            au verdict de conformité. Les champs ci-dessous sont <strong>tous facultatifs</strong> — mais chacun
            manquant rend le verdict <strong>indéterminable</strong>.
          </p>

          <p className="pt-1 font-semibold text-primary">Champs relevés (saisis)</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Masse brute</strong> (g) : pesée du colis entier, contenant compris.</li>
            <li><strong>Tare du contenant</strong> (g) : masse du sac ou du fût vide. Si elle n&apos;est pas renseignée, la masse brute tient lieu de masse nette.</li>
            <li><strong>Bruit de fond du local</strong> (µSv/h) : relevé <strong>à la mesure d&apos;entrée</strong> et de nouveau <strong>au contrôle de sortie</strong>.</li>
            <li><strong>Débits de dose</strong> (µSv/h) : <strong>au contact</strong> et <strong>à 1 mètre</strong>, à l&apos;entrée puis à la sortie. La mesure à 1 m documente l&apos;exposition du personnel qui manipule le colis.</li>
          </ul>

          <p className="pt-1 font-semibold text-primary">Formules (calculées, jamais saisies)</p>
          <div className="space-y-2">
            <Formula>masse nette = masse brute − tare</Formula>
            <Formula>activité massique (Bq/g) = activité résiduelle (MBq) × 1e6 / masse nette</Formula>
            <Formula>
              t_lib (h) = (T½ / ln2) × ln[ A0 × 1e6 / (niveau de libération × masse nette) ]
              <br />
              soit, pour le Tc-99m : 8,666 × ln[ A0 × 1e6 / (100 × masse nette) ]
            </Formula>
            <Formula>durée de stockage (h) = date de sortie − date d&apos;entrée en stockage</Formula>
            <Formula>indice de conformité = durée de stockage / t_lib</Formula>
            <Formula>conforme = activité massique ≤ niveau de libération  ET  indice de conformité ≥ 1</Formula>
          </div>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>t_lib</strong> est la durée théorique de décroissance nécessaire pour que l&apos;activité massique atteigne le niveau de libération. Elle vaut <strong>0</strong> si le déchet est déjà sous le seuil dès la mesure initiale.</li>
            <li>Un <strong>indice de conformité ≥ 1</strong> signifie que le déchet a bien été gardé <strong>au moins aussi longtemps</strong> que la décroissance l&apos;exigeait.</li>
          </ul>

          <p className="pt-1 font-semibold text-primary">Pourquoi « conforme » est CALCULÉ et jamais saisi</p>
          <p>
            La conformité n&apos;est pas une case que l&apos;on coche : c&apos;est la <strong>conclusion</strong> des mesures.
            L&apos;application ne propose donc aucun champ « conforme » — elle le <strong>déduit</strong> des données
            enregistrées. Il devient ainsi <strong>structurellement impossible de déclarer une conformité non
            démontrée</strong> : tant qu&apos;une donnée du calcul manque (activité, masse nette, demi-vie, niveau de
            libération, date d&apos;entrée, date de sortie), le verdict affiché est <strong>« Indéterminé »</strong> —
            jamais « conforme » par défaut — et la liste des données manquantes est indiquée.
          </p>

          <p className="pt-1 font-semibold text-primary">Conformité (preuve) ≠ statut « libérable » (opérationnel)</p>
          <p>Ce sont deux notions distinctes, affichées côte à côte et jamais substituées l&apos;une à l&apos;autre :</p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              le <strong>verdict de conformité</strong> est une <strong>preuve documentaire a posteriori</strong>, sur
              règle <strong>ET</strong> : activité massique sous le seuil <strong>ET</strong> indice de conformité ≥ 1.
              Il figure dans les rapports imprimés (registre, mensuel, annuel) et dans les fiches de preuve ;
            </li>
            <li>
              le <strong>statut « libérable »</strong> est une <strong>décision opérationnelle</strong> de l&apos;application,
              sur règle <strong>OU</strong> : activité massique sous le seuil <strong>ou</strong> au moins 10 périodes
              écoulées (voir §2). Il déclenche l&apos;alerte et ouvre le contrôle de sortie.
            </li>
          </ul>
          <p>
            Un déchet peut donc être <strong>« libérable »</strong> (10 périodes écoulées) tout en restant
            <strong> « indéterminé »</strong> au sens de la preuve si, par exemple, la masse nette n&apos;a jamais été pesée.
          </p>

          <p className="pt-1 font-semibold text-primary">Pourquoi relever le bruit de fond du local</p>
          <p>
            Un débit de dose de sortie <strong>ne veut rien dire sans son bruit de fond</strong> : une mesure de
            0,4 µSv/h dans un local dont le fond est à 0,35 µSv/h ne traduit presque aucune contamination résiduelle,
            alors que la même valeur dans un local à 0,05 µSv/h en traduit une. C&apos;est le <strong>débit net</strong>
            (mesure − bruit de fond) qui porte l&apos;information ; il est calculé et imprimé sur les fiches de preuve.
            Sans le bruit de fond enregistré, la mesure de sortie n&apos;est pas défendable devant un inspecteur.
          </p>

          <p className="rounded-lg border border-yellow-400/40 bg-yellow-400/10 p-3 text-primary">
            <strong>Rappel :</strong> les <strong>niveaux de libération</strong> utilisés par ces formules sont
            <strong> indicatifs</strong>. Ils doivent être <strong>vérifiés et validés par la PCR</strong> / le
            physicien médical au regard de la réglementation nationale avant tout usage opérationnel. Un niveau propre
            à l&apos;établissement peut être saisi par déchet ; il prime alors sur la valeur de référence.
          </p>
        </Section>

        <Section icon={<BookOpen className="h-5 w-5" />} title="Glossaire">
          <ul className="space-y-1.5">
            <li><strong>Activité résiduelle</strong> : activité restante d&apos;un déchet à l&apos;instant présent, après décroissance (MBq).</li>
            <li><strong>Activité massique</strong> : activité par unité de masse (Bq/g) — c&apos;est elle qui est comparée au seuil de libération.</li>
            <li><strong>Masse brute / tare / masse nette</strong> : masse du colis complet / masse du contenant vide / différence des deux — c&apos;est la masse nette qui divise l&apos;activité.</li>
            <li><strong>Bruit de fond</strong> : débit de dose ambiant du local (µSv/h), relevé à la mesure et au contrôle de sortie ; il se soustrait des mesures pour obtenir le débit net.</li>
            <li><strong>Période (demi-vie)</strong> : durée au bout de laquelle l&apos;activité est divisée par deux.</li>
            <li><strong>Seuil de libération</strong> : activité massique (Bq/g) en dessous de laquelle un déchet peut être libéré de la zone contrôlée.</li>
            <li><strong>t_lib</strong> : durée théorique de décroissance (h) nécessaire pour atteindre le seuil de libération.</li>
            <li><strong>Indice de conformité</strong> : durée de stockage réelle ÷ t_lib ; ≥ 1 = déchet gardé assez longtemps.</li>
            <li><strong>Conformité (calculée)</strong> : preuve documentaire — activité massique sous le seuil <strong>et</strong> indice ≥ 1. Calculée, jamais saisie ; « indéterminée » si une donnée manque.</li>
            <li><strong>Libérable</strong> : statut opérationnel — déchet remplissant au moins un critère (activité massique sous le seuil <strong>ou</strong> ≥ 10 périodes).</li>
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
