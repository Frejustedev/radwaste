'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import {
  BarChart3, Package, Activity, Trash2, AlertTriangle, ClipboardCheck, Users, Settings,
  HelpCircle, LogOut, Bell, Menu, X, Sun, Moon, LineChart,
} from 'lucide-react';
import { auth, logout } from '@/lib/firebase';
import { useRadwasteData } from '@/lib/hooks/useRadwasteData';
import { useToast } from '@/components/ui/Toast';
import { NavButton } from '@/components/ui/Primitives';
import { Logo } from '@/components/ui/Logo';
import { APP_VERSION, lastUpdatedFr } from '@/lib/version';
import { canManageUsers, canManageSettings } from '@/lib/permissions';
import { DashboardView } from '@/components/views/DashboardView';
import { IdentificationView } from '@/components/views/IdentificationView';
import { DecroissanceView } from '@/components/views/DecroissanceView';
import { SortieView } from '@/components/views/SortieView';
import { IncidentsView } from '@/components/views/IncidentsView';
import { ReportsView } from '@/components/views/ReportsView';
import { StatisticsView } from '@/components/views/StatisticsView';
import { UsersView } from '@/components/views/UsersView';
import { SettingsView } from '@/components/views/SettingsView';
import { HelpView } from '@/components/views/HelpView';

type Tab = 'dashboard' | 'identification' | 'decroissance' | 'sortie' | 'incidents' | 'reports' | 'statistiques' | 'users' | 'settings' | 'help';

const TAB_TITLES: Record<Tab, string> = {
  dashboard: 'Tableau de Bord Général',
  identification: 'Identification & Stockage',
  decroissance: 'Suivi de Décroissance',
  sortie: 'Contrôle & Élimination',
  incidents: 'Registre des Incidents',
  reports: 'Rapports & Conformité',
  statistiques: 'Statistiques & Études',
  users: 'Gestion des Utilisateurs',
  settings: 'Paramètres Système',
  help: 'Aide & Documentation',
};

export default function NuclearWasteApp() {
  const { error } = useToast();
  const onSubError = useCallback((msg: string) => error(msg), [error]);
  const { authUser, profile, authLoading, profileLoading, wasteItems, incidents, users, actionLogs, settings } = useRadwasteData(onSubError);

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  const liberableCount = useMemo(() => wasteItems.filter((w) => w.status === 'liberable').length, [wasteItems]);

  const go = (tab: Tab) => { setActiveTab(tab); setIsMobileMenuOpen(false); };

  if (authLoading) {
    return <div className="h-screen bg-app flex items-center justify-center"><div className="animate-spin text-yellow-400 text-2xl" aria-label="Chargement">☢</div></div>;
  }

  if (!authUser) {
    const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginError('');
      setLoginBusy(true);
      try {
        await signInWithEmailAndPassword(auth, loginEmail.trim().toLowerCase(), loginPassword);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
          setLoginError("Identifiants incorrects. Vérifiez l'adresse email et le mot de passe.");
        } else if (code === 'auth/too-many-requests') {
          setLoginError('Trop de tentatives. Veuillez réessayer plus tard.');
        } else {
          setLoginError('Erreur de connexion.' + (code ? ` (${code})` : ''));
        }
      } finally {
        setLoginBusy(false);
      }
    };

    const handleReset = async () => {
      if (!loginEmail.trim()) { setLoginError('Saisissez votre adresse email pour recevoir le lien.'); return; }
      try {
        await sendPasswordResetEmail(auth, loginEmail.trim().toLowerCase());
        setLoginError('Email de réinitialisation envoyé. Vérifiez votre boîte mail.');
      } catch (err) {
        setLoginError('Échec de l’envoi du lien.' + ((err as { code?: string }).code ? ` (${(err as { code?: string }).code})` : ''));
      }
    };

    return (
      <div data-theme={theme} className="h-screen bg-app text-primary flex items-center justify-center font-sans">
        <div className="w-full max-w-sm bg-surface p-8 rounded-2xl border border-subtle flex flex-col items-center">
          <Logo size={64} className="mb-6" />
          <h1 className="text-2xl font-black uppercase tracking-tighter mb-2 text-primary">RadWaste <span className="text-accent">IMENA</span></h1>
          <p className="text-xs text-faint uppercase tracking-widest font-bold text-center mb-6">Authentification requise</p>
          <form className="w-full space-y-4" onSubmit={handleLogin}>
            <label className="sr-only" htmlFor="login-email">Adresse email</label>
            <input id="login-email" type="email" placeholder="Adresse email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required
              className="w-full p-3 bg-surface-2 border border-subtle rounded-lg text-primary text-sm focus:outline-none focus:border-yellow-400" />
            <label className="sr-only" htmlFor="login-password">Mot de passe</label>
            <input id="login-password" type="password" placeholder="Mot de passe" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required
              className="w-full p-3 bg-surface-2 border border-subtle rounded-lg text-primary text-sm focus:outline-none focus:border-yellow-400" />
            {loginError && <p className="text-red-500 text-xs text-center" role="alert">{loginError}</p>}
            <button type="submit" disabled={loginBusy}
              className="w-full py-4 bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-black rounded-lg font-black uppercase text-xs transition-colors mt-2">
              {loginBusy ? 'Connexion…' : 'Se connecter'}
            </button>
            <button type="button" onClick={handleReset} className="w-full py-2 text-faint hover:text-primary text-xs transition-colors">
              Mot de passe oublié ?
            </button>
          </form>
          <p className="mt-6 text-[11px] text-faint text-center">
            Version {APP_VERSION} · Mise à jour le {lastUpdatedFr()}
          </p>
        </div>
      </div>
    );
  }

  if (profileLoading) {
    return <div className="h-screen bg-app flex items-center justify-center text-primary text-xs uppercase tracking-widest font-bold">Chargement du profil…</div>;
  }

  if (!profile) {
    return (
      <div data-theme={theme} className="h-screen bg-app text-primary flex items-center justify-center font-sans">
        <div className="w-full max-w-sm bg-surface p-8 rounded-2xl border border-subtle flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500 rounded-xl flex items-center justify-center text-red-500 font-black italic text-3xl mb-6" aria-hidden="true">!</div>
          <h1 className="text-xl font-black uppercase tracking-tighter mb-2 text-primary">Accès Non Autorisé</h1>
          <p className="text-xs text-muted mb-8 leading-relaxed">Votre compte n&apos;a pas été autorisé par l&apos;administrateur de l&apos;établissement. Veuillez contacter votre administrateur pour obtenir vos accès.</p>
          <button onClick={() => logout()} className="w-full py-4 bg-black/10 dark:bg-white/10 hover:opacity-80 text-primary rounded-lg font-black uppercase text-xs transition-colors">Se Déconnecter</button>
        </div>
      </div>
    );
  }

  const initials = profile.name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <div data-theme={theme} className="h-screen flex flex-col font-sans overflow-hidden bg-app text-primary print:h-auto print:bg-white print:text-black">
      <header className="h-16 border-b border-subtle flex shrink-0 items-center justify-between px-4 md:px-8 bg-header print:hidden z-20 relative">
        <div className="flex items-center gap-4">
          <button className="md:hidden p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} aria-label={isMobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={isMobileMenuOpen}>
            {isMobileMenuOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
          </button>
          <Logo size={32} />
          <h1 className="text-xl font-black uppercase tracking-tighter">RadWaste <span className="text-accent">IMENA</span></h1>
        </div>
        <div className="flex items-center gap-4 md:gap-6">
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-full text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/10" aria-label={theme === 'dark' ? 'Activer le thème clair' : 'Activer le thème sombre'}>
            {theme === 'dark' ? <Sun className="w-5 h-5" aria-hidden="true" /> : <Moon className="w-5 h-5" aria-hidden="true" />}
          </button>
          <div className="relative">
            <button onClick={() => setShowNotifications(!showNotifications)} className="p-2 rounded-full relative text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/10" aria-label="Notifications">
              <Bell className="w-5 h-5" aria-hidden="true" />
              {liberableCount > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full" aria-hidden="true" />}
            </button>
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-72 rounded-xl shadow-2xl border overflow-hidden z-50 bg-surface border-subtle">
                <div className="px-4 py-3 border-b text-xs font-bold uppercase tracking-widest border-subtle text-muted">Notifications</div>
                {liberableCount > 0 ? (
                  <div className="p-4 text-sm text-primary"><span className="text-red-500 font-bold uppercase text-xs block mb-1">Action requise</span>{liberableCount} déchet(s) prêt(s) à être libéré(s).</div>
                ) : <div className="p-6 text-center text-sm text-faint">Aucune notification</div>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-primary">{profile.name}</div>
              <div className="text-[11px] text-faint uppercase">{profile.role}</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-700 dark:bg-slate-800 border border-subtle flex items-center justify-center font-bold text-sm text-accent">{initials}</div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden print:overflow-visible relative">
        {isMobileMenuOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} aria-hidden="true" />}

        <aside className={`w-64 border-r flex flex-col py-4 print:hidden absolute md:relative z-40 h-full transition-transform duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} bg-surface-2 border-subtle`}>
          <nav className="flex-1 px-4 space-y-0.5 overflow-y-auto" aria-label="Navigation principale">
            <div className="text-[11px] uppercase tracking-widest text-faint font-bold mb-4 px-4">Modules Principaux</div>
            <NavButton active={activeTab === 'dashboard'} onClick={() => go('dashboard')} icon={<BarChart3 className="w-5 h-5" />} label="Tableau de Bord" />
            <NavButton active={activeTab === 'identification'} onClick={() => go('identification')} icon={<Package className="w-5 h-5" />} label="Identification & Stockage" />
            <NavButton active={activeTab === 'decroissance'} onClick={() => go('decroissance')} icon={<Activity className="w-5 h-5" />} label="Suivi de Décroissance" />
            <NavButton active={activeTab === 'sortie'} onClick={() => go('sortie')} icon={<Trash2 className="w-5 h-5" />} label="Sortie & Élimination" />
            <NavButton active={activeTab === 'incidents'} onClick={() => go('incidents')} icon={<AlertTriangle className="w-5 h-5" />} label="Gestion des Incidents" />
            <NavButton active={activeTab === 'reports'} onClick={() => go('reports')} icon={<ClipboardCheck className="w-5 h-5" />} label="Rapports Automatiques" />
            <NavButton active={activeTab === 'statistiques'} onClick={() => go('statistiques')} icon={<LineChart className="w-5 h-5" />} label="Statistiques & Études" />
            {canManageUsers(profile) && <NavButton active={activeTab === 'users'} onClick={() => go('users')} icon={<Users className="w-5 h-5" />} label="Gestion Utilisateurs" />}
            <div className="text-[11px] uppercase tracking-widest text-faint font-bold mb-2 px-4 border-t border-subtle pt-4 mt-6">Système</div>
            {canManageSettings(profile) && <NavButton active={activeTab === 'settings'} onClick={() => go('settings')} icon={<Settings className="w-5 h-5" />} label="Paramètres" />}
            <NavButton active={activeTab === 'help'} onClick={() => go('help')} icon={<HelpCircle className="w-5 h-5" />} label="Aide & Documentation" />
            <button onClick={() => logout()} className="w-full flex items-center gap-4 px-4 py-2 mt-2 rounded-xl text-red-500 hover:bg-black/5 dark:hover:bg-white/5 transition-all font-black text-xs">
              <LogOut className="w-5 h-5" aria-hidden="true" /><span>Déconnexion</span>
            </button>
          </nav>
          {liberableCount > 0 && (
            <div className="px-8 py-4 shrink-0">
              <div className="p-4 bg-yellow-400/10 border border-yellow-400/20 rounded-xl">
                <div className="text-[11px] text-accent font-black uppercase mb-1">Alertes</div>
                <div className="text-xs text-primary leading-tight font-medium">{liberableCount} déchet(s) candidat(s) à la libération.</div>
              </div>
            </div>
          )}
          <div className="px-6 py-3 shrink-0 text-[11px] text-faint border-t border-subtle">
            Version {APP_VERSION} · MàJ {lastUpdatedFr()}
          </div>
        </aside>

        <main className="flex-1 flex flex-col bg-app overflow-y-auto overflow-x-hidden print:overflow-visible print:bg-white">
          <section className="p-4 md:p-8 flex-1 flex flex-col print:p-0">
            <header className="mb-8 shrink-0 print:hidden">
              <h2 className="text-2xl font-black italic text-primary tracking-tighter uppercase">{TAB_TITLES[activeTab]}</h2>
            </header>
            {activeTab === 'dashboard' && <DashboardView wasteItems={wasteItems} incidents={incidents} onNavigate={(t) => go(t as Tab)} theme={theme} />}
            {activeTab === 'identification' && <IdentificationView wasteItems={wasteItems} users={users} profile={profile} settings={settings} />}
            {activeTab === 'decroissance' && <DecroissanceView wasteItems={wasteItems} profile={profile} />}
            {activeTab === 'sortie' && <SortieView wasteItems={wasteItems} users={users} profile={profile} settings={settings} />}
            {activeTab === 'incidents' && <IncidentsView incidents={incidents} wasteItems={wasteItems} users={users} profile={profile} settings={settings} />}
            {activeTab === 'reports' && <ReportsView wasteItems={wasteItems} />}
            {activeTab === 'statistiques' && <StatisticsView wasteItems={wasteItems} incidents={incidents} profile={profile} settings={settings} theme={theme} />}
            {activeTab === 'users' && canManageUsers(profile) && <UsersView users={users} profile={profile} />}
            {activeTab === 'settings' && canManageSettings(profile) && <SettingsView wasteItems={wasteItems} incidents={incidents} users={users} actionLogs={actionLogs} profile={profile} settings={settings} />}
            {activeTab === 'help' && <HelpView />}
          </section>
        </main>
      </div>
    </div>
  );
}
