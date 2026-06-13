'use client';

import { LifeBuoy, PackageCheck, Activity, ClipboardCheck, Mail } from 'lucide-react';
import { SectionHeader } from '@/components/ui/Primitives';

/**
 * Vue d'aide & documentation de RadWaste Pro.
 * Contenu statique uniquement — aucune mutation, aucune prop.
 */
export function HelpView() {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Aide & Documentation"
        description="Guide d'utilisation de la gestion des déchets radioactifs."
      />

      <div className="bg-surface border border-subtle rounded-2xl p-6 space-y-8">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-accent/10 p-3 text-accent">
            <LifeBuoy className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-primary">Guide de Démarrage Rapide</h2>
            <p className="text-sm text-muted">
              Les étapes clés du cycle de vie d'un déchet, de l'enregistrement à l'élimination.
            </p>
          </div>
        </div>

        <section>
          <h3 className="flex items-center gap-2 border-b border-subtle pb-2 text-base font-semibold text-primary">
            <PackageCheck className="h-5 w-5 text-accent" aria-hidden="true" />
            1. Identification &amp; Stockage
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Enregistrez chaque déchet dès sa production en précisant le radionucléide (isotope),
            l'activité initiale, la masse ainsi que les débits de dose mesurés (au contact et à 1 m).
            À partir de la demi-vie de l'isotope et de l'activité massique, le système calcule
            automatiquement la date théorique de libération du déchet.
          </p>
        </section>

        <section>
          <h3 className="flex items-center gap-2 border-b border-subtle pb-2 text-base font-semibold text-primary">
            <Activity className="h-5 w-5 text-accent" aria-hidden="true" />
            2. Suivi de Décroissance
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Suivez la décroissance radioactive de chaque déchet pour repérer les candidats à la
            libération. Un déchet n'est considéré comme libérable que lorsque deux critères sont
            réunis simultanément&nbsp;: son activité massique est passée sous le seuil de libération
            réglementaire <em>et</em> au moins 10 périodes (demi-vies) se sont écoulées depuis la
            mesure de référence.
          </p>
        </section>

        <section>
          <h3 className="flex items-center gap-2 border-b border-subtle pb-2 text-base font-semibold text-primary">
            <ClipboardCheck className="h-5 w-5 text-accent" aria-hidden="true" />
            3. Contrôle de Sortie &amp; Élimination
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Avant toute élimination, la sortie du déchet doit être validée par une nouvelle mesure
            du débit de dose au contact, qui doit être inférieur ou égal au seuil opérationnel
            autorisé. Toute dérogation à ce contrôle est explicitement tracée dans le registre,
            avec son responsable et sa justification.
          </p>
        </section>

        <section>
          <h3 className="flex items-center gap-2 border-b border-subtle pb-2 text-base font-semibold text-primary">
            <Mail className="h-5 w-5 text-accent" aria-hidden="true" />
            4. Support
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            En cas de question ou de difficulté, contactez l'administrateur de votre établissement.
            Pour le support technique de l'application, écrivez à{' '}
            <a
              href="mailto:support@imena-gest.net"
              className="text-accent underline underline-offset-2"
            >
              support@imena-gest.net
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
