'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { mockWaste, mockIncidents, mockUsers } from '@/lib/data';
import { WasteItem, Incident, User } from '@/types';
import { differenceInHours } from 'date-fns';
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import {
  ShieldAlert,
  Trash2,
  Package,
  Activity,
  AlertTriangle,
  ClipboardCheck,
  BarChart3,
  Users,
  Settings,
  HelpCircle,
  LogOut,
  Plus,
  Bell,
  Menu,
  X,
  Sun,
  Moon,
  Edit2
} from 'lucide-react';

const COLORS = ['#FACC15', '#3B82F6', '#A855F7', '#64748B']; // yellow, blue, purple, slate

export default function NuclearWasteApp() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'identification' | 'decroissance' | 'sortie' | 'incidents' | 'reports' | 'users' | 'settings' | 'help'>('dashboard');
  const [wasteItems, setWasteItems] = useState<WasteItem[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [actionLogs, setActionLogs] = useState<any[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [authUser, setAuthUser] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);
  
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    let unsubscribeAuth: any;
    let unsubWaste: any;
    let unsubIncidents: any;
    let unsubUsers: any;
    let unsubLogs: any;

    import('@/lib/firebase').then(({ auth, db }) => {
      import('firebase/auth').then(({ onAuthStateChanged }) => {
        unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
          setAuthUser(user);
          setAuthLoading(false);
          
          if (user) {
            import('firebase/firestore').then(async ({ collection, query, where, onSnapshot, getDocs, setDoc, doc }) => {
              // Ensure admin exists
              if (user.email === 'agbotonfrejuste@gmail.com') {
                const { getDoc } = await import('firebase/firestore');
                const adminDoc = await getDoc(doc(db, 'users', user.uid));
                if (!adminDoc.exists()) {
                  const newAdmin: Partial<User> = {
                    id: user.uid,
                    hospitalId: 'default-hospital',
                    name: user.displayName || 'Administrateur',
                    email: user.email,
                    role: 'Administrateur' as any,
                    permissions: ['admin_complet'],
                    lastLogin: new Date().toISOString()
                  };
                  await setDoc(doc(db, 'users', user.uid), newAdmin);
                  setCurrentUserProfile(newAdmin as User);
                } else {
                  setCurrentUserProfile(adminDoc.data() as User);
                }
              }

              const qWaste = query(collection(db, 'wasteItems'), where('hospitalId', '==', 'default-hospital'));
              unsubWaste = onSnapshot(qWaste, (snapshot) => {
                const w = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as WasteItem[];
                setWasteItems(w);
              }, (error) => console.error("WasteItems snapshot error:", error));

              const qInc = query(collection(db, 'incidents'), where('hospitalId', '==', 'default-hospital'));
              unsubIncidents = onSnapshot(qInc, (snapshot) => {
                const inc = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Incident[];
                setIncidents(inc);
              }, (error) => console.error("Incidents snapshot error:", error));

              const qUsers = query(collection(db, 'users'), where('hospitalId', '==', 'default-hospital'));
              unsubUsers = onSnapshot(qUsers, (snapshot) => {
                const u = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as User[];
                setUsers(u);
                const profile = u.find(p => p.email === user.email);
                if (profile) setCurrentUserProfile(profile);
                setDataLoaded(true);
              }, (error) => console.error("Users snapshot error:", error));

              const qLogs = query(collection(db, 'logs'), where('hospitalId', '==', 'default-hospital'));
              unsubLogs = onSnapshot(qLogs, (snapshot) => {
                const l = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setActionLogs(l.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
              }, (error) => console.error("Logs snapshot error:", error));
            });
          } else {
            setCurrentUserProfile(null);
            setDataLoaded(true);
            setWasteItems([]);
            setIncidents([]);
            setUsers([]);
            if (unsubWaste) unsubWaste();
            if (unsubIncidents) unsubIncidents();
            if (unsubUsers) unsubUsers();
            if (unsubLogs) unsubLogs();
          }
        });
      });
    });

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubWaste) unsubWaste();
      if (unsubIncidents) unsubIncidents();
      if (unsubUsers) unsubUsers();
      if (unsubLogs) unsubLogs();
    };
  }, []);
  
  // Calculate specific metrics for dashboard
  const metrics = useMemo(() => {
    const validIncidents = incidents.filter((i: any) => {
      if (i.wasteId) return wasteItems.some(w => w.id === i.wasteId);
      return true;
    });

    const totalStored = wasteItems.filter(w => w.status === 'stockage').length;
    const liberable = wasteItems.filter(w => w.status === 'liberable').length;
    const incidentsCount = validIncidents.length;
    const nonConformes = wasteItems.filter(w => w.exitConformity === false).length + incidentsCount;
    
    const totalActivity = wasteItems
      .filter(w => w.status === 'stockage')
      .reduce((sum, item) => {
         const hours = (new Date().getTime() - new Date(item.measureDate).getTime()) / 3600000;
         const hl = hours / item.halfLife;
         const residual = item.initialActivity * Math.pow(0.5, hl);
         return sum + residual;
      }, 0);

    return { totalStored, liberable, incidentsCount, totalActivity, nonConformes };
  }, [wasteItems, incidents, tick]);

  const logAction = (actionDesc: string) => {
    import('@/lib/firebase').then(({ db }) => {
      import('firebase/firestore').then(({ collection, addDoc }) => {
        addDoc(collection(db, 'logs'), {
          hospitalId: 'default-hospital',
          date: new Date().toISOString(),
          userEmail: currentUserProfile?.email || 'Système',
          action: actionDesc
        }).catch(err => console.error("Error logging action:", err));
      });
    });
  };

  const statsData = [
    { name: 'En stockage', value: metrics.totalStored },
    { name: 'Libérables', value: metrics.liberable },
    { name: 'Éliminés', value: wasteItems.filter(w => w.status === 'elimine').length },
  ];

  if (authLoading) {
    return <div className="h-screen bg-[#0A0B0D] flex items-center justify-center"><div className="animate-spin text-yellow-400">☢</div></div>;
  }

  if (!authUser) {
    const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginError('');
      try {
        const { auth } = await import('../lib/firebase');
        const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth');
        
        const emailTrimmed = loginEmail.trim().toLowerCase();
        try {
          await signInWithEmailAndPassword(auth, emailTrimmed, loginPassword);
        } catch (err: any) {
          const adminEmail = 'agbotonfrejuste@gmail.com';
          
          if (emailTrimmed === adminEmail) {
            try {
              await createUserWithEmailAndPassword(auth, emailTrimmed, loginPassword);
            } catch (createErr: any) {
              if (createErr.code === 'auth/email-already-in-use') {
                setLoginError('Le mot de passe est incorrect.');
              } else {
                setLoginError('Erreur: ' + createErr.message);
              }
            }
          } else {
            console.error(err);
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
              setLoginError("Identifiants incorrects. Vérifiez l'adresse email et le mot de passe.");
            } else if (err.code === 'auth/too-many-requests') {
              setLoginError("Trop de tentatives infructueuses. Veuillez réessayer plus tard.");
            } else {
              setLoginError('Erreur de connexion. (' + err.code + ')');
            }
          }
        }
      } catch (err) {
        setLoginError('Une erreur est survenue.');
      }
    };

    return (
      <div className="h-screen bg-[#0A0B0D] text-[#E0E2E5] flex items-center justify-center font-sans overflow-hidden select-none">
        <div className="w-full max-w-sm bg-[#15171C] p-8 rounded-2xl border border-white/5 flex flex-col items-center">
          <div className="w-16 h-16 bg-yellow-400 rounded-xl flex items-center justify-center text-black font-black italic text-3xl mb-6">☢</div>
          <h1 className="text-2xl font-black uppercase tracking-tighter mb-2">RadWaste <span className="text-yellow-400">Pro</span></h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold text-center mb-6">Authentification requise</p>
          
          <form className="w-full space-y-4" onSubmit={handleLogin}>
            <div>
              <input 
                type="email" 
                placeholder="Adresse email" 
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-400"
              />
            </div>
            <div>
              <input 
                type="password" 
                placeholder="Mot de passe" 
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-400"
              />
            </div>
            {loginError && <p className="text-red-500 text-xs text-center">{loginError}</p>}
            
            {loginError && loginError.includes('Compte déjà existant') && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const { auth } = await import('../lib/firebase');
                    const { sendPasswordResetEmail } = await import('firebase/auth');
                    await sendPasswordResetEmail(auth, loginEmail.trim().toLowerCase());
                    setLoginError('Email de réinitialisation envoyé ! Vérifiez votre boîte mail.');
                  } catch (e: any) {
                    setLoginError('Erreur envoi email: ' + e.message);
                  }
                }}
                className="w-full py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs transition-colors"
              >
                Mot de passe oublié ? (Envoyer le lien)
              </button>
            )}

            <button 
              type="submit"
              className="w-full py-4 bg-yellow-400 hover:bg-yellow-500 text-black rounded-lg font-black uppercase text-xs transition-colors mt-2"
            >
              Se connecter
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!dataLoaded) {
    return <div className="h-screen bg-[#0A0B0D] flex items-center justify-center text-white text-xs uppercase tracking-widest font-bold">Chargement du profil...</div>;
  }

  if (!currentUserProfile) {
    return (
      <div className="h-screen bg-[#0A0B0D] text-[#E0E2E5] flex items-center justify-center font-sans overflow-hidden select-none">
        <div className="w-full max-w-sm bg-[#15171C] p-8 rounded-2xl border border-white/5 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500 rounded-xl flex items-center justify-center text-red-500 font-black italic text-3xl mb-6">!</div>
          <h1 className="text-xl font-black uppercase tracking-tighter mb-2 text-white">Accès Non Autorisé</h1>
          <p className="text-xs text-slate-400 mb-8 leading-relaxed">Votre compte Google n&apos;a pas été autorisé par l&apos;administrateur de l&apos;hôpital. Veuillez contacter M. Agboton pour obtenir vos identifiants d&apos;accès.</p>
          
          <button 
            onClick={() => {
              import('../lib/firebase').then(({ logout }) => {
                logout();
              });
            }} 
            className="w-full py-4 bg-white/10 hover:bg-white/20 text-white rounded-lg font-black uppercase text-xs transition-colors"
          >
            Se Déconnecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col font-sans overflow-hidden select-none print:h-auto print:min-h-screen print:bg-white print:text-black ${theme === 'light' ? 'light-theme' : 'bg-[#0A0B0D] text-[#E0E2E5]'}`}>
      {/* Header */}
      <header className="h-16 border-b border-white/10 flex shrink-0 items-center justify-between px-4 md:px-8 bg-[#0F1115] print:hidden z-20 relative">
        <div className="flex items-center gap-4">
          <button 
            className="md:hidden p-2 rounded-lg hover:bg-white/5"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="w-8 h-8 rounded flex items-center justify-center font-black italic bg-yellow-400 text-black">☢</div>
          <h1 className="text-xl font-black uppercase tracking-tighter">RadWaste <span className="text-yellow-400">Pro</span></h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden lg:flex gap-4 text-[10px] uppercase font-bold tracking-[0.2em] italic text-slate-500">
            <span>Système: En ligne</span>
            <span>Serveur: Labo-Chaud-01</span>
          </div>
          <div className="flex items-center gap-4 pl-0 lg:pl-6 lg:border-l border-white/10">
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
              className="p-2 rounded-full transition-colors text-slate-400 hover:text-white hover:bg-white/10"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 rounded-full transition-colors relative text-slate-400 hover:text-white hover:bg-white/10"
              >
                <Bell className="w-5 h-5" />
                {metrics.liberable > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-inherit"></span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl shadow-2xl border overflow-hidden z-50 bg-[#15171C] border-white/10">
                  <div className="px-4 py-3 border-b text-xs font-bold uppercase tracking-widest border-white/10 text-slate-400">Notifications</div>
                  <div className="max-h-60 overflow-y-auto">
                    {metrics.liberable > 0 ? (
                      <div className="p-4 border-b last:border-0 border-white/5 hover:bg-white/5">
                        <div className="text-red-500 font-bold text-xs uppercase mb-1">Action requise</div>
                        <div className="text-sm text-white">{metrics.liberable} déchet(s) sont prêts à être libérés.</div>
                      </div>
                    ) : (
                      <div className="p-6 text-center text-sm text-slate-500">Aucune notification</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-white">{users.length > 0 ? users[0].name : 'Utilisateur'}</div>
                <div className="text-[10px] text-slate-500 uppercase">{users.length > 0 ? users[0].role : 'Invité'}</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/20 flex items-center justify-center font-bold text-sm text-yellow-400">
                {users.length > 0 ? users[0].name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : 'U'}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden print:overflow-visible relative">
        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
        
        {/* Sidebar Navigation */}
        <aside className={`w-64 border-r flex flex-col py-4 print:hidden absolute md:relative z-40 h-full transition-transform duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} bg-[#0D0E12] border-white/5`}>
          <nav className="flex-1 px-4 space-y-0.5 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            <div className="text-[10px] uppercase tracking-widest text-slate-600 font-bold mb-4 px-4">Modules Principaux</div>
            <NavButton active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }} icon={<BarChart3 className="w-5 h-5"/>} label="Tableau de Bord" />
            <NavButton active={activeTab === 'identification'} onClick={() => { setActiveTab('identification'); setIsMobileMenuOpen(false); }} icon={<Package className="w-5 h-5"/>} label="Identification & Stockage" />
            <NavButton active={activeTab === 'decroissance'} onClick={() => { setActiveTab('decroissance'); setIsMobileMenuOpen(false); }} icon={<Activity className="w-5 h-5"/>} label="Suivi de Décroissance" />
            <NavButton active={activeTab === 'sortie'} onClick={() => { setActiveTab('sortie'); setIsMobileMenuOpen(false); }} icon={<Trash2 className="w-5 h-5"/>} label="Sortie & Élimination" />
            <NavButton active={activeTab === 'incidents'} onClick={() => { setActiveTab('incidents'); setIsMobileMenuOpen(false); }} icon={<AlertTriangle className="w-5 h-5"/>} label="Gestion des Incidents" />
            <NavButton active={activeTab === 'reports'} onClick={() => { setActiveTab('reports'); setIsMobileMenuOpen(false); }} icon={<ClipboardCheck className="w-5 h-5"/>} label="Rapports Automatiques" />
            <NavButton active={activeTab === 'users'} onClick={() => { setActiveTab('users'); setIsMobileMenuOpen(false); }} icon={<Users className="w-5 h-5"/>} label="Gestion Utilisateurs" />

            <div className="pt-6 pb-2">
              <div className="text-[10px] uppercase tracking-widest text-slate-600 font-bold mb-2 px-4 border-t border-white/5 pt-4">Système</div>
            </div>
            <NavButton active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setIsMobileMenuOpen(false); }} icon={<Settings className="w-5 h-5"/>} label="Paramètres" />
            <NavButton active={activeTab === 'help'} onClick={() => { setActiveTab('help'); setIsMobileMenuOpen(false); }} icon={<HelpCircle className="w-5 h-5"/>} label="Aide & Documentation" />
            <button onClick={() => {
              import('../lib/firebase').then(({ logout }) => {
                logout();
              });
            }} className="w-full flex items-center gap-4 px-4 py-2 mt-2 rounded-xl text-red-400 hover:bg-white/5 hover:text-red-300 transition-all font-black text-xs group cursor-pointer border border-transparent">
              <LogOut className="w-5 h-5" />
              <span>Déconnexion</span>
            </button>
          </nav>
          <div className="px-8 py-4 shrink-0">
            <div className="p-4 bg-yellow-400/5 border border-yellow-400/20 rounded-xl">
              <div className="text-[10px] text-yellow-400 font-black uppercase mb-1">Alertes</div>
              <div className="text-xs text-white leading-tight font-medium">{metrics.liberable} Déchets à libérer d&apos;urgence.</div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col bg-[#0A0B0D] overflow-y-auto overflow-x-hidden print:overflow-visible print:bg-white">
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 p-4 md:p-8 flex-1 flex flex-col print:block print:p-0">
            <header className="mb-8 shrink-0 print:hidden">
              <h2 className="text-2xl font-black italic text-white tracking-tighter uppercase">
                {activeTab === 'dashboard' && 'Tableau de Bord Général'}
                {activeTab === 'identification' && 'Identification & Stockage'}
                {activeTab === 'decroissance' && 'Suivi de Décroissance'}
                {activeTab === 'sortie' && 'Contrôle & Élimination'}
                {activeTab === 'incidents' && 'Registre des Incidents'}
                {activeTab === 'reports' && 'Rapports & Conformité'}
                {activeTab === 'users' && 'Gestion des Utilisateurs'}
                {activeTab === 'settings' && 'Paramètres Système'}
                {activeTab === 'help' && 'Aide & Documentation'}
              </h2>
            </header>

            {activeTab === 'dashboard' && (
              <DashboardView metrics={metrics} statsData={statsData} wasteItems={wasteItems} setActiveTab={setActiveTab} />
            )}
            {activeTab === 'identification' && (
              <IdentificationView wasteItems={wasteItems} setWasteItems={setWasteItems} users={users} logAction={logAction} />
            )}
            {activeTab === 'decroissance' && (
              <DecroissanceView wasteItems={wasteItems} setWasteItems={setWasteItems} logAction={logAction} />
            )}
            {activeTab === 'sortie' && (
              <SortieView wasteItems={wasteItems} setWasteItems={setWasteItems} users={users} logAction={logAction} />
            )}
            {activeTab === 'incidents' && (
              <IncidentsView incidents={incidents} setIncidents={setIncidents} wasteItems={wasteItems} users={users} logAction={logAction} />
            )}
            {activeTab === 'reports' && (
              <ReportsView wasteItems={wasteItems} />
            )}
            {activeTab === 'users' && (
              <UsersView users={users} setUsers={setUsers} logAction={logAction} />
            )}
            {activeTab === 'settings' && (
              <SettingsView wasteItems={wasteItems} incidents={incidents} users={users} actionLogs={actionLogs} logAction={logAction} />
            )}
            {activeTab === 'help' && (
              <HelpView />
            )}
          </section>
        </main>
      </div>

      <footer className="h-8 bg-black border-t border-white/10 flex items-center justify-between px-8 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600 shrink-0 hidden md:flex">
        <div>Conformité ASN/AFNOR: Active-2023.v4</div>
        <div className="flex gap-6">
          <span>Capacité de stockage: 78.4%</span>
          <span>Capteurs: Actifs</span>
          <span className="text-yellow-600">Heure locale: 14:48:12</span>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------
// VIEW COMPONENTS
// ---------------------------

function DashboardView({ metrics, statsData, wasteItems, setActiveTab }: any) {
  const radionuclideData = useMemo(() => {
    const counts: Record<string, number> = {};
    wasteItems.forEach((w: any) => {
      if (w.status !== 'elimine') {
        counts[w.radionuclide] = (counts[w.radionuclide] || 0) + 1;
      }
    });
    return Object.keys(counts).map(key => ({
      name: key,
      count: counts[key]
    }));
  }, [wasteItems]);

  return (
    <div className="space-y-6 flex-1 flex flex-col">
      {/* Quick Actions */}
      <div className="flex flex-wrap gap-4 shrink-0">
        <button onClick={() => setActiveTab('identification')} className="px-6 py-3 bg-yellow-400 hover:bg-yellow-500 text-black rounded-lg font-black uppercase text-xs flex items-center justify-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> Nouveau Déchet
        </button>
        <button onClick={() => setActiveTab('sortie')} className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg font-black uppercase text-xs flex items-center justify-center gap-2 transition-colors">
          <Trash2 className="w-4 h-4" /> Libérer des déchets
        </button>
        <button onClick={() => setActiveTab('reports')} className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg font-black uppercase text-xs flex items-center justify-center gap-2 transition-colors">
          <ClipboardCheck className="w-4 h-4" /> Registre PDF
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 shrink-0">
        <KPICard title="En Stockage" value={metrics.totalStored} icon={<Package className="w-4 h-4"/>} />
        <KPICard title="Activité Restante (MBq)" value={metrics.totalActivity.toFixed(2)} icon={<Activity className="w-4 h-4"/>} valueColor="text-yellow-400" />
        <KPICard title="Libérables" value={metrics.liberable} icon={<Trash2 className="w-4 h-4"/>} />
        <KPICard title="Non Conformes / Incidents" value={metrics.nonConformes} icon={<AlertTriangle className="w-4 h-4"/>} valueColor="text-red-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 shrink-0">
        {/* Charts */}
        <div className="bg-[#15171C] p-6 rounded-2xl border border-white/5 flex flex-col min-h-[250px]">
          <h3 className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-4">Répartition par Statut</h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statsData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                  {statsData.map((entry: any, index: number) => (
                     <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={{ backgroundColor: '#0D0E12', borderColor: '#334155', borderRadius: '8px' }} itemStyle={{ color: '#E0E2E5' }} />
                <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#15171C] p-6 rounded-2xl border border-white/5 flex flex-col min-h-[250px]">
          <h3 className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-4">Volume par Radionucléide</h3>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={radionuclideData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                <XAxis dataKey="name" stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
                <RechartsTooltip cursor={{ fill: '#ffffff10' }} contentStyle={{ backgroundColor: '#0D0E12', borderColor: '#334155', borderRadius: '8px' }} />
                <Bar dataKey="count" fill="#FACC15" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      
      <div className="bg-[#15171C] border border-white/5 rounded-3xl flex flex-col flex-1 overflow-hidden shrink-0 min-h-[300px]">
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <h2 className="text-xl font-black italic uppercase">Déchets libérables d&apos;urgence</h2>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] uppercase font-black tracking-widest text-slate-500 border-b border-white/5">
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Radionucléide</th>
                <th className="px-6 py-4">Entrée</th>
                <th className="px-6 py-4">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {wasteItems.filter((w: any) => w.status === 'liberable').map((w: any) => (
                <tr key={w.id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-yellow-400">{w.id}</td>
                  <td className="px-6 py-4 text-xs font-bold capitalize">{w.type}</td>
                  <td className="px-6 py-4 text-sm font-black italic">{w.radionuclide}</td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-400">{new Date(w.storageEntryDate).toLocaleDateString('fr-FR')}</td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-green-500/20 text-green-400 text-[10px] font-black uppercase rounded-full">Libérable</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const calculateResidual = (w: any) => {
  const hours = (new Date().getTime() - new Date(w.measureDate).getTime()) / 3600000;
  const hl = Math.max(0, hours / w.halfLife);
  return (w.initialActivity * Math.pow(0.5, hl)).toFixed(4);
};

const calculateDecayPercentage = (w: any) => {
  const hours = (new Date().getTime() - new Date(w.measureDate).getTime()) / 3600000;
  const hl = Math.max(0, hours / w.halfLife);
  const pct = (1 - Math.pow(0.5, hl)) * 100;
  return Math.min(100, pct).toFixed(1);
};

const getTheoreticalReleaseDate = (w: any) => {
  if (w.initialActivity <= w.regulatoryClearanceLevel) return new Date(w.measureDate).toLocaleDateString('fr-FR');
  const hoursNeeded = w.halfLife * (Math.log(w.regulatoryClearanceLevel / w.initialActivity) / Math.log(0.5));
  const releaseDate = new Date(new Date(w.measureDate).getTime() + hoursNeeded * 3600000);
  return releaseDate.toLocaleDateString('fr-FR');
};

function IdentificationView({ wasteItems, setWasteItems, users, logAction }: any) {
  const [isAdding, setIsAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const userOptions = users.map((u: any) => u.name);
  const [formData, setFormData] = useState({
    originService: 'labo chaud',
    responsibleOperator: userOptions.length > 0 ? userOptions[0] : '',
    type: 'solide',
    radionuclide: 'Tc-99m',
    initialActivity: '',
    measureDate: new Date().toISOString().slice(0, 16),
    doseRateContact: '',
    doseRate1m: '',
    halfLife: '',
    regulatoryClearanceLevel: '0.1'
  });

  const handleChange = (e: any) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const resetForm = () => {
    setFormData({ originService: 'labo chaud', responsibleOperator: userOptions.length > 0 ? userOptions[0] : '', type: 'solide', radionuclide: 'Tc-99m', initialActivity: '', measureDate: new Date().toISOString().slice(0, 16), doseRateContact: '', doseRate1m: '', halfLife: '', regulatoryClearanceLevel: '0.1' });
    setEditId(null);
    setIsAdding(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.originService || !formData.type || !formData.radionuclide) return;

    import('@/lib/firebase').then(({ db }) => {
      import('firebase/firestore').then(({ doc, setDoc, updateDoc }) => {
        if (editId) {
          updateDoc(doc(db, 'wasteItems', editId), {
            originService: formData.originService,
            responsibleOperator: formData.responsibleOperator,
            type: formData.type as any,
            radionuclide: formData.radionuclide as any,
            initialActivity: Number(formData.initialActivity) || 0,
            measureDate: new Date(formData.measureDate).toISOString(),
            doseRateContact: Number(formData.doseRateContact) || 0,
            doseRate1m: Number(formData.doseRate1m) || ((Number(formData.doseRateContact) || 0) / 10),
            halfLife: Number(formData.halfLife) || 6,
            regulatoryClearanceLevel: Number(formData.regulatoryClearanceLevel) || 0.1,
          }).then(() => logAction(`Déchet ${editId} mis à jour.`)).catch(err => console.error(err));
        } else {
          const isotopeCode = formData.radionuclide ? formData.radionuclide.replace('-', '').toUpperCase() : 'UNK';
          const newItem: Partial<WasteItem> = {
            id: `WST-${isotopeCode}-${String(wasteItems.length + 1).padStart(3, '0')}`,
            createdAt: new Date().toISOString(),
            hospitalId: 'default-hospital',
            originService: formData.originService,
            responsibleOperator: formData.responsibleOperator,
            type: formData.type as any,
            radionuclide: formData.radionuclide as any,
            initialActivity: Number(formData.initialActivity) || 0,
            measureDate: new Date(formData.measureDate).toISOString(),
            doseRateContact: Number(formData.doseRateContact) || 0,
            doseRate1m: Number(formData.doseRate1m) || ((Number(formData.doseRateContact) || 0) / 10),
            halfLife: Number(formData.halfLife) || 6,
            regulatoryClearanceLevel: Number(formData.regulatoryClearanceLevel) || 0.1,
            storageEntryDate: new Date().toISOString(),
            storageResponsible: 'Dr. Martin',
            expectedDecayDuration: 10,
            status: 'stockage'
          };
          setDoc(doc(db, 'wasteItems', newItem.id!), newItem).then(() => logAction(`Déchet ${newItem.id} créé.`)).catch(err => console.error(err));
        }
      });
    });
    
    resetForm();
  };

  const handleEdit = (w: any) => {
    setFormData({
      originService: w.originService || 'labo chaud',
      responsibleOperator: w.responsibleOperator || '',
      type: w.type || 'solide',
      radionuclide: w.radionuclide || 'Tc-99m',
      initialActivity: String(w.initialActivity),
      measureDate: w.measureDate ? new Date(w.measureDate).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
      doseRateContact: String(w.doseRateContact),
      doseRate1m: String(w.doseRate1m),
      halfLife: String(w.halfLife),
      regulatoryClearanceLevel: String(w.regulatoryClearanceLevel)
    });
    setEditId(w.id);
    setIsAdding(true);
  };

  const handleDelete = (id: string) => {
    import('@/lib/firebase').then(({ db }) => {
      import('firebase/firestore').then(({ doc, deleteDoc, collection, query, where, getDocs }) => {
        deleteDoc(doc(db, 'wasteItems', id))
          .then(async () => {
             logAction(`Déchet ${id} supprimé.`);
             const q = query(collection(db, 'incidents'), where('wasteId', '==', id));
             const snapshot = await getDocs(q);
             snapshot.forEach(d => {
               deleteDoc(doc(db, 'incidents', d.id));
             });
          })
          .catch(err => console.error(err));
      });
    });
  };

  return (
    <div className="space-y-6 flex-1 flex flex-col relative">
      <div className="flex justify-between items-center bg-[#15171C] p-4 rounded-xl border border-white/5">
        <div>
          <h3 className="font-bold text-white uppercase text-sm">Identification et Stockage</h3>
          <p className="text-xs text-slate-500">Ajout de nouveaux déchets dans le local.</p>
        </div>
        <button 
          onClick={() => { if (isAdding) resetForm(); else setIsAdding(true); }}
          className="bg-yellow-400 hover:bg-yellow-500 text-black px-4 py-2 font-black text-[10px] uppercase rounded-full transition-colors flex items-center gap-2"
        >
          {isAdding ? 'Annuler' : <><Plus className="w-3 h-3"/> Enregistrer un Déchet</>}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="bg-[#15171C] p-6 rounded-2xl border border-white/5 animate-in fade-in zoom-in-95">
          <h4 className="text-lg font-black italic uppercase mb-4 text-white">{editId ? 'Modifier Déchet' : 'Nouveau Déchet'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <FormSelect required label="Service d'origine" name="originService" value={formData.originService} onChange={handleChange} options={['labo chaud', 'salle d’injection', 'salle d’attente chaude', 'salle d’acquisition', 'salle de consultation chaude', 'salle d’interprétation']} />
            <FormSelect required label="Opérateur" name="responsibleOperator" value={formData.responsibleOperator} onChange={handleChange} options={userOptions} />
            <FormSelect required label="Type de déchet" name="type" value={formData.type} onChange={handleChange} options={['solide', 'liquide', 'biologique', 'seringue', 'flacon', 'tubulure', 'gants', 'compresses', 'autres']} />
            <FormSelect required label="Radionucléide" name="radionuclide" value={formData.radionuclide} onChange={handleChange} options={['Tc-99m', 'I-131', 'F-18', 'Lu-177', 'Ga-68', 'Y-90', 'autres']} />
            <FormInput required label="Activité initiale (MBq)" name="initialActivity" value={formData.initialActivity} onChange={handleChange} type="number" placeholder="250" />
            <FormInput required label="Date de mesure" name="measureDate" value={formData.measureDate} onChange={handleChange} type="datetime-local" />
            <FormInput required label="Demi-vie physique (h)" name="halfLife" value={formData.halfLife} onChange={handleChange} type="number" placeholder="6" />
            <FormInput required label="Séuil réglementaire (MBq)" name="regulatoryClearanceLevel" value={formData.regulatoryClearanceLevel} onChange={handleChange} type="number" step="0.01" />
            <FormInput required label="Débit au contact (µSv/h)" name="doseRateContact" value={formData.doseRateContact} onChange={handleChange} type="number" placeholder="10" />
            <FormInput label="Débit à 1 mètre (µSv/h)" name="doseRate1m" value={formData.doseRate1m} onChange={handleChange} type="number" placeholder="1" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={resetForm} className="px-4 py-2 border border-white/10 rounded-full font-black text-[10px] uppercase hover:bg-white/5">Annuler</button>
            <button type="submit" className="px-4 py-2 bg-yellow-400 text-black rounded-full font-black text-[10px] uppercase hover:bg-yellow-500">{editId ? 'Mettre à jour' : 'Enregistrer'}</button>
          </div>
        </form>
      )}

      <div className="bg-[#15171C] border border-white/5 rounded-3xl flex flex-col flex-1 overflow-hidden shrink-0">
        <div className="flex flex-col flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-[#15171C] z-10 shadow-sm">
              <tr className="text-[10px] uppercase font-black tracking-widest text-slate-500 border-b border-white/5">
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Info</th>
                <th className="px-6 py-4">Isotope</th>
                <th className="px-6 py-4">Mesure Initiale</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {wasteItems.filter((w: any) => w.status === 'stockage').map((w: any) => (
                <tr key={w.id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-yellow-400">{w.id}</td>
                  <td className="px-6 py-4">
                    <p className="capitalize font-bold text-white text-xs">{w.type}</p>
                    <p className="text-xs text-slate-500 truncate max-w-[120px] mb-1">{w.originService}</p>
                    <p className="text-[9px] uppercase tracking-widest text-slate-600">{w.responsibleOperator}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-black italic shadow-text">{w.radionuclide}</div>
                    <p className="text-[10px] text-slate-500">T½: {w.halfLife}h</p>
                  </td>
                  <td className="px-6 py-4 text-xs font-mono">
                    <span className="font-bold text-white">{w.initialActivity} MBq</span>
                    <br/><span className="text-slate-500 text-[10px]">{new Date(w.measureDate).toLocaleString('fr-FR', {dateStyle: 'short', timeStyle: 'short'})}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-[10px] font-black uppercase rounded-full">En Stockage</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 transition-opacity">
                      <button onClick={() => handleEdit(w)} className="p-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors" title="Modifier">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(w.id)} className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors" title="Supprimer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DecroissanceView({ wasteItems, setWasteItems, logAction }: any) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleCheckThresholds = () => {
    setIsUpdating(true);
    let toUpdate: any[] = [];
    wasteItems.forEach((w: any) => {
      if (w.status === 'stockage') {
        const residual = parseFloat(calculateResidual(w));
        if (residual <= w.regulatoryClearanceLevel) {
          toUpdate.push({ ...w, status: 'liberable' });
        }
      }
    });

    if (toUpdate.length > 0) {
      import('@/lib/firebase').then(({ db }) => {
        import('firebase/firestore').then(({ doc, writeBatch }) => {
          const batch = writeBatch(db);
          toUpdate.forEach(w => {
            batch.update(doc(db, 'wasteItems', w.id), { status: 'liberable' });
          });
          batch.commit().then(() => {
            if(logAction) logAction(`${toUpdate.length} déchet(s) passé(s) au statut libérable.`);
            setIsUpdating(false);
          }).catch(e => { console.error(e); setIsUpdating(false); });
        });
      });
    } else {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6 flex-1 flex flex-col relative">
      <div className="flex justify-between items-center bg-[#15171C] p-4 rounded-xl border border-white/5">
        <div>
          <h3 className="font-bold text-white uppercase text-sm">Suivi de Décroissance</h3>
          <p className="text-xs text-slate-500">Surveillance de l&apos;activité résiduelle et libération automatique.</p>
        </div>
        <button 
          onClick={handleCheckThresholds}
          disabled={isUpdating}
          className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-4 py-2 font-black text-[10px] uppercase rounded-full transition-colors flex items-center gap-2"
        >
          {isUpdating ? 'Analyse en cours...' : <><Activity className="w-3 h-3"/> Vérifier les Seuils</>}
        </button>
      </div>

      <div className="bg-[#15171C] border border-white/5 rounded-3xl flex flex-col flex-1 overflow-hidden shrink-0">
        <div className="flex flex-col flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-[#15171C] z-10 shadow-sm">
              <tr className="text-[10px] uppercase font-black tracking-widest text-slate-500 border-b border-white/5">
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Isotope</th>
                <th className="px-6 py-4">Mesure Initiale</th>
                <th className="px-6 py-4 bg-yellow-400/5 text-yellow-400 border-l border-yellow-400/10">Activité Résiduelle</th>
                <th className="px-6 py-4">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {wasteItems.filter((w: any) => w.status !== 'elimine').map((w: any) => (
                <tr key={w.id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-yellow-400">{w.id}</td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-black italic shadow-text">{w.radionuclide}</div>
                    <p className="text-[10px] text-slate-500">T½: {w.halfLife}h</p>
                  </td>
                  <td className="px-6 py-4 text-xs font-mono">
                    <span className="font-bold text-white">{w.initialActivity} MBq</span>
                    <br/><span className="text-slate-500 text-[10px]">{new Date(w.measureDate).toLocaleString('fr-FR', {dateStyle: 'short', timeStyle: 'short'})}</span>
                  </td>
                  <td className="px-6 py-4 border-l border-white/5 font-mono text-xs font-black text-yellow-400 bg-yellow-400/5">
                    {calculateResidual(w)} MBq
                    <div className="text-[10px] text-slate-500 font-sans font-medium mt-1">Décroissance: {calculateDecayPercentage(w)}%</div>
                    <div className="text-[10px] text-slate-400 font-sans font-medium">Date sortie estimée: {getTheoreticalReleaseDate(w)}</div>
                  </td>
                  <td className="px-6 py-4">
                    {w.status === 'stockage' && <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-[10px] font-black uppercase rounded-full">En Stockage</span>}
                    {w.status === 'liberable' && <span className="px-3 py-1 animate-pulse bg-green-500/20 text-green-400 text-[10px] font-black uppercase rounded-full">Libérable</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SortieView({ wasteItems, setWasteItems, users, logAction }: any) {
  const [controlItem, setControlItem] = useState<WasteItem | null>(null);
  const userOptions = users.map((u: any) => u.name);
  const [controlData, setControlData] = useState({
    exitDoseRate: '',
    exitConformity: 'Oui',
    exitController: userOptions.length > 0 ? userOptions[0] : '',
    eliminationMode: 'Filière ANDRA'
  });

  const handleControlChange = (e: any) => setControlData({ ...controlData, [e.target.name]: e.target.value });

  const handleControlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!controlItem) return;

    const updatedData = {
      status: 'elimine',
      exitControlDate: new Date().toISOString(),
      exitDoseRate: Number(controlData.exitDoseRate),
      exitConformity: controlData.exitConformity === 'Oui',
      exitController: controlData.exitController,
      eliminationDate: new Date().toISOString(),
      eliminationMode: controlData.eliminationMode,
      eliminationResponsible: controlData.exitController
    };

    import('@/lib/firebase').then(({ db }) => {
      import('firebase/firestore').then(({ doc, updateDoc }) => {
        updateDoc(doc(db, 'wasteItems', controlItem.id), updatedData).then(() => {
          logAction(`Libération / Élimination du déchet ${controlItem.id} via ${controlData.eliminationMode}`);
          setControlItem(null);
          setControlData({ exitDoseRate: '', exitConformity: 'Oui', exitController: userOptions.length > 0 ? userOptions[0] : '', eliminationMode: 'Filière ANDRA' });
        }).catch(err => {
          console.error("Error updating document: ", err);
        });
      });
    });
  };

  return (
    <div className="space-y-6 flex-1 flex flex-col relative">
      {controlItem && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#15171C] p-6 rounded-2xl border border-white/10 shadow-2xl w-full max-w-lg">
            <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
               <div>
                 <h3 className="text-lg font-black italic uppercase text-white">Contrôle avant Sortie</h3>
                 <p className="text-xs text-yellow-400 font-mono mt-1">{controlItem.id}</p>
               </div>
               <button onClick={() => setControlItem(null)} className="text-slate-500 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleControlSubmit} className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                 <FormInput required label="Débit de dose mesuré (µSv/h)" type="number" name="exitDoseRate" value={controlData.exitDoseRate} onChange={handleControlChange} placeholder="< 0.1" />
                 <FormSelect required label="Conformité réglementaire" name="exitConformity" value={controlData.exitConformity} onChange={handleControlChange} options={['Oui', 'Non']} />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <FormSelect required label="Mode d'élimination" name="eliminationMode" value={controlData.eliminationMode} onChange={handleControlChange} options={['Filière ANDRA', 'Incinérateur classique', 'Déchets standards', 'Autre']} />
                 <FormSelect required label="Contrôleur / Signature" name="exitController" value={controlData.exitController} onChange={handleControlChange} options={userOptions} />
               </div>
               <div className="pt-4 flex justify-end gap-3 border-t border-white/5 mt-4">
                 <button type="button" onClick={() => setControlItem(null)} className="px-4 py-2 border border-white/10 rounded-full font-black text-[10px] uppercase hover:bg-white/5">Annuler</button>
                 <button type="submit" className="px-4 py-2 bg-green-500 text-white rounded-full font-black text-[10px] uppercase hover:bg-green-600">Valider l&apos;Élimination</button>
               </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-[#15171C] border border-white/5 rounded-3xl flex flex-col flex-1 overflow-hidden shrink-0">
        <div className="flex flex-col flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-[#15171C] z-10 shadow-sm">
              <tr className="text-[10px] uppercase font-black tracking-widest text-slate-500 border-b border-white/5">
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Activité Résiduelle</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4">Contrôle / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {wasteItems.filter((w: any) => w.status === 'liberable' || w.status === 'elimine').map((w: any) => (
                <tr key={w.id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-yellow-400">
                    {w.id}
                    <div className="text-white font-bold capitalize mt-1 font-sans">{w.type}</div>
                  </td>
                 <td className="px-6 py-4 text-xs font-mono">
                    <span className="font-bold text-white">{calculateResidual(w)} MBq</span>
                  </td>
                  <td className="px-6 py-4">
                    {w.status === 'liberable' && <span className="px-3 py-1 animate-pulse bg-green-500/20 text-green-400 text-[10px] font-black uppercase rounded-full">Libérable</span>}
                    {w.status === 'elimine' && <span className="px-3 py-1 bg-slate-500/20 text-slate-400 text-[10px] font-black uppercase rounded-full">Éliminé</span>}
                  </td>
                  <td className="px-6 py-4">
                     {w.status === 'liberable' && (
                       <button onClick={() => setControlItem(w)} className="text-yellow-400 hover:text-yellow-300 font-black uppercase text-[10px] border border-yellow-400/20 px-3 py-1 rounded-full">Action →</button>
                     )}
                     {w.status === 'elimine' && (
                       <div className="text-slate-500 text-[10px] font-medium leading-relaxed">
                         Contrôlé le <span className="font-bold text-slate-300">{new Date(w.eliminationDate || '').toLocaleDateString('fr-FR')}</span><br/>
                         Mode: <span className="font-bold text-slate-300">{w.eliminationMode}</span>
                       </div>
                     )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function IncidentsView({ incidents, setIncidents, wasteItems, users, logAction }: any) {
  const [isAdding, setIsAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const userOptions = users.map((u: any) => u.name);
  const [formData, setFormData] = useState({
    type: 'Déversement accidentel',
    personnelFunction: userOptions.length > 0 ? userOptions[0] : '',
    doseRateBefore: '',
    correctiveActions: '',
    doseRateAfter: '',
    wasteId: ''
  });

  const handleChange = (e: any) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const resetForm = () => {
    setFormData({type: 'Déversement accidentel', personnelFunction: userOptions.length > 0 ? userOptions[0] : '', doseRateBefore: '', correctiveActions: '', doseRateAfter: '', wasteId: ''});
    setIsAdding(false);
    setEditId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    import('@/lib/firebase').then(({ db }) => {
      import('firebase/firestore').then(({ doc, setDoc, updateDoc }) => {
        if (editId) {
          updateDoc(doc(db, 'incidents', editId), {
             personnelFunction: formData.personnelFunction,
             type: formData.type as any,
             doseRateBefore: Number(formData.doseRateBefore),
             correctiveActions: formData.correctiveActions,
             doseRateAfter: Number(formData.doseRateAfter),
             wasteId: formData.wasteId
          }).then(() => logAction(`Incident ${editId} mis à jour.`)).catch(err => console.error(err));
        } else {
          const newIncident: Partial<Incident> = {
            id: `INC-2024-${String(incidents.length + 1).padStart(3, '0')}`,
            date: new Date().toISOString(),
            hospitalId: 'default-hospital',
            personnelFunction: formData.personnelFunction,
            type: formData.type as any,
            doseRateBefore: Number(formData.doseRateBefore),
            correctiveActions: formData.correctiveActions,
            doseRateAfter: Number(formData.doseRateAfter),
            wasteId: formData.wasteId
          };
          setDoc(doc(db, 'incidents', newIncident.id!), newIncident).then(() => logAction(`Incident ${newIncident.id} documenté.`)).catch(err => console.error(err));
        }
      });
    });
    resetForm();
  };

  const handleEdit = (inc: any) => {
    setFormData({
      type: inc.type || 'Déversement accidentel',
      personnelFunction: inc.personnelFunction || '',
      doseRateBefore: String(inc.doseRateBefore || ''),
      correctiveActions: inc.correctiveActions || '',
      doseRateAfter: String(inc.doseRateAfter || ''),
      wasteId: inc.wasteId || ''
    });
    setEditId(inc.id);
    setIsAdding(true);
  };

  const handleDelete = (id: string) => {
    import('@/lib/firebase').then(({ db }) => {
      import('firebase/firestore').then(({ doc, deleteDoc }) => {
        deleteDoc(doc(db, 'incidents', id)).then(() => logAction(`Incident ${id} supprimé.`)).catch(err => console.error(err));
      });
    });
  };

  return (
    <div className="space-y-6 flex-1 flex flex-col">
       <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-2xl flex items-start gap-4">
         <AlertTriangle className="text-red-500 shrink-0 mt-1" />
         <div className="flex-1">
           <h3 className="text-red-500 font-bold text-sm uppercase">Protocole d&apos;urgence</h3>
           <p className="text-red-200/80 mt-1 text-xs">En cas de déversement ou contamination, isolez le périmètre, utilisez le kit de décontamination et notifiez immédiatement le conseiller en radioprotection.</p>
           <button onClick={() => { if (isAdding) resetForm(); else setIsAdding(true); }} className="mt-4 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-full font-black text-[10px] uppercase transition shadow-sm">
             {isAdding ? 'Annuler' : 'Déclarer un incident'}
           </button>
         </div>
       </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="bg-[#15171C] p-6 rounded-2xl border border-white/5 animate-in fade-in zoom-in-95">
          <h4 className="text-lg font-black italic uppercase mb-4 text-white">{editId ? 'Modifier Rapport d\'Incident' : 'Nouveau Rapport d\'Incident'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <FormSelect required label="Type d'incident" name="type" value={formData.type} onChange={handleChange} options={['Déversement accidentel', 'Contamination', 'Perte de déchet']} />
            <FormSelect required label="Radioprotection / Personne Impliquée" name="personnelFunction" value={formData.personnelFunction} onChange={handleChange} options={userOptions} />
            <FormSelect label="ID Déchet (Optionnel)" name="wasteId" value={formData.wasteId} onChange={handleChange} options={wasteItems.map((w: any) => w.id)} />
            <FormInput required label="Dose Initiale (µSv/h)" name="doseRateBefore" type="number" value={formData.doseRateBefore} onChange={handleChange} />
            <FormInput required label="Dose Finale après contrôle (µSv/h)" name="doseRateAfter" type="number" value={formData.doseRateAfter} onChange={handleChange} />
            <div className="lg:col-span-3">
              <label className="block text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">Actions Correctives</label>
              <textarea required name="correctiveActions" value={formData.correctiveActions} onChange={handleChange} rows={2} className="w-full px-3 py-2 bg-[#0D0E12] border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-yellow-400/50 text-white text-sm"></textarea>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={resetForm} className="px-4 py-2 border border-white/10 rounded-full font-black text-[10px] uppercase hover:bg-white/5">Annuler</button>
            <button type="submit" className="px-4 py-2 bg-red-500 text-white rounded-full font-black text-[10px] uppercase hover:bg-red-600">{editId ? 'Mettre à jour' : 'Enregistrer l\'incident'}</button>
          </div>
        </form>
      )}

       <div className="bg-[#15171C] rounded-3xl border border-white/5 overflow-hidden shrink-0">
         {incidents.filter((inc: any) => !inc.wasteId || wasteItems.some((w: any) => w.id === inc.wasteId)).map((inc: any) => (
           <div key={inc.id} className="group p-6 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition">
             <div className="flex justify-between items-start mb-2">
               <div>
                 <span className="font-mono text-xs text-yellow-400 mr-3">{inc.id}</span>
                 <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] font-black uppercase rounded-full">{inc.type}</span>
               </div>
               <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2 transition-opacity">
                   <button onClick={() => handleEdit(inc)} className="p-1 text-slate-400 hover:text-white transition-colors" title="Modifier">
                     <Edit2 className="w-4 h-4" />
                   </button>
                   <button onClick={() => handleDelete(inc.id)} className="p-1 text-red-500 hover:text-red-400 transition-colors" title="Supprimer">
                     <Trash2 className="w-4 h-4" />
                   </button>
                 </div>
                 <span className="text-xs font-bold text-slate-500">{new Date(inc.date).toLocaleDateString('fr-FR')}</span>
               </div>
             </div>
             <p className="text-xs text-slate-400 mb-4"><span className="font-bold text-slate-300">Implication:</span> {inc.personnelFunction} | <span className="font-bold text-slate-300">Déchet:</span> <span className="font-mono text-white">{inc.wasteId || 'N/A'}</span></p>
             <div className="bg-[#0D0E12] rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs mt-3 border border-white/5">
               <div>
                  <p className="text-slate-500 mb-1 uppercase font-bold text-[10px]">Dose Initiale</p>
                  <p className="font-mono text-red-400 font-black italic">{inc.doseRateBefore} µSv/h</p>
               </div>
                <div className="md:col-span-2">
                  <p className="text-slate-500 mb-1 uppercase font-bold text-[10px]">Actions Correctives</p>
                  <p className="text-slate-300 font-medium">{inc.correctiveActions}</p>
               </div>
               <div>
                  <p className="text-slate-500 mb-1 uppercase font-bold text-[10px]">Dose Finale</p>
                  <p className="font-mono text-green-400 font-black italic">{inc.doseRateAfter} µSv/h</p>
               </div>
             </div>
           </div>
         ))}
       </div>
    </div>
  );
}

function ReportsView({ wasteItems }: any) {
  const [printReport, setPrintReport] = useState<string | null>(null);

  const handlePrint = (reportName: string) => {
    setPrintReport(reportName);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  useEffect(() => {
    const afterPrint = () => setPrintReport(null);
    window.addEventListener('afterprint', afterPrint);
    return () => window.removeEventListener('afterprint', afterPrint);
  }, []);

  return (
    <div className="space-y-6 flex-1 flex flex-col">
      <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 ${printReport ? 'hidden' : 'block'} print:hidden`}>
        <ReportCard onClick={() => handlePrint('REGISTRE')} title="Registre Réglementaire ASN" description="Export complet des mouvements de déchets pour le registre obligatoire." icon={<ClipboardCheck />} />
        <ReportCard onClick={() => handlePrint('MENSUEL')} title="Rapport Mensuel" description="Bilan quantitatif des activités et éliminations du mois." icon={<BarChart3 />} />
        <ReportCard onClick={() => handlePrint('INVENTAIRE')} title="Inventaire Radiologique" description="Instantané de la radioactivité totale présente dans le local de stockage." icon={<Activity />} />
      </div>

      {printReport && (
        <div className="bg-white text-black min-h-screen">
          {printReport === 'REGISTRE' && <PrintRegistre wasteItems={wasteItems} />}
          {printReport === 'MENSUEL' && <PrintMensuel wasteItems={wasteItems} />}
          {printReport === 'INVENTAIRE' && <PrintInventaire wasteItems={wasteItems} />}
        </div>
      )}
    </div>
  );
}

function PrintRegistre({ wasteItems }: any) {
  return (
    <div className="font-sans text-black">
      <div className="border-b-2 border-black pb-4 mb-6 text-black">
        <h1 className="text-2xl font-bold uppercase mb-1 text-black">Registre Réglementaire des Déchets Radioactifs</h1>
        <p className="text-sm font-medium">Généré le : {new Date().toLocaleString('fr-FR')}</p>
        <p className="text-sm font-medium">Établissement : Centre Hospitalier / Service de Médecine Nucléaire</p>
      </div>

      <table className="w-full text-left text-xs border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-100 uppercase">
            <th className="border border-gray-300 p-2 font-bold text-black">Numéro Unique</th>
            <th className="border border-gray-300 p-2 font-bold text-black">Entrée</th>
            <th className="border border-gray-300 p-2 font-bold text-black">Isotope</th>
            <th className="border border-gray-300 p-2 font-bold text-black">Act. Init (MBq)</th>
            <th className="border border-gray-300 p-2 font-bold text-black">Statut</th>
            <th className="border border-gray-300 p-2 font-bold text-black">Sortie</th>
          </tr>
        </thead>
        <tbody>
          {wasteItems.map((w: any) => (
             <tr key={w.id}>
                <td className="border border-gray-300 p-2 font-mono text-black">{w.id}</td>
                <td className="border border-gray-300 p-2 text-black">{new Date(w.storageEntryDate).toLocaleDateString('fr-FR')}</td>
                <td className="border border-gray-300 p-2 text-black font-bold">{w.radionuclide}</td>
                <td className="border border-gray-300 p-2 text-black">{w.initialActivity}</td>
                <td className="border border-gray-300 p-2 capitalize text-black">{w.status}</td>
                <td className="border border-gray-300 p-2 text-black">{w.eliminationDate ? new Date(w.eliminationDate).toLocaleDateString('fr-FR') : '-'}</td>
             </tr>
          ))}
        </tbody>
      </table>
      
      <div className="pt-8 mt-12 border-t border-gray-400">
        <p className="text-xs uppercase tracking-wider font-bold">Signature Responsable de la Radioprotection :</p>
      </div>
    </div>
  );
}

function PrintInventaire({ wasteItems }: any) {
  const stock = wasteItems.filter((w: any) => w.status === 'stockage' || w.status === 'liberable');
  return (
    <div className="font-sans text-black">
      <div className="border-b-2 border-black pb-4 mb-6">
        <h1 className="text-2xl font-bold uppercase mb-1 text-black">Inventaire Radiologique</h1>
        <p className="text-sm text-black">Généré le : {new Date().toLocaleString('fr-FR')}</p>
      </div>
      <p className="mb-4">Total des déchets actuellement en local de décroissance : <strong>{stock.length}</strong></p>
      <table className="w-full text-left text-xs border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-100 uppercase">
             <th className="border border-gray-300 p-2 text-black font-bold">ID</th>
             <th className="border border-gray-300 p-2 text-black font-bold">Isotope</th>
             <th className="border border-gray-300 p-2 text-black font-bold">Date Entrée</th>
             <th className="border border-gray-300 p-2 text-black font-bold">Activité Résiduelle</th>
             <th className="border border-gray-300 p-2 text-black font-bold">Libération Prévue</th>
          </tr>
        </thead>
        <tbody>
          {stock.map((w: any) => (
             <tr key={w.id}>
               <td className="border border-gray-300 p-2 font-mono text-black">{w.id}</td>
               <td className="border border-gray-300 p-2 font-bold text-black">{w.radionuclide}</td>
               <td className="border border-gray-300 p-2 text-black">{new Date(w.storageEntryDate).toLocaleDateString('fr-FR')}</td>
               <td className="border border-gray-300 p-2 text-black">{calculateResidual(w)} MBq</td>
               <td className="border border-gray-300 p-2 text-black">{getTheoreticalReleaseDate(w)}</td>
             </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrintMensuel({ wasteItems }: any) {
  const elimines = wasteItems.filter((w: any) => w.status === 'elimine');
  return (
    <div className="font-sans text-black">
      <div className="border-b-2 border-black pb-4 mb-6">
        <h1 className="text-2xl font-bold uppercase mb-1 text-black">Rapport Mensuel des Éliminations</h1>
        <p className="text-sm text-black">Généré le : {new Date().toLocaleString('fr-FR')}</p>
      </div>
      <table className="w-full text-left text-xs border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-100 uppercase">
             <th className="border border-gray-300 p-2 text-black font-bold">ID</th>
             <th className="border border-gray-300 p-2 text-black font-bold">Date Sortie</th>
             <th className="border border-gray-300 p-2 text-black font-bold">Isotope</th>
             <th className="border border-gray-300 p-2 text-black font-bold">Mode d&apos;élimination</th>
             <th className="border border-gray-300 p-2 text-black font-bold">Visa Contrôleur</th>
          </tr>
        </thead>
        <tbody>
          {elimines.map((w: any) => (
             <tr key={w.id}>
               <td className="border border-gray-300 p-2 font-mono text-black">{w.id}</td>
               <td className="border border-gray-300 p-2 text-black">{new Date(w.eliminationDate || '').toLocaleDateString('fr-FR')}</td>
               <td className="border border-gray-300 p-2 font-bold text-black">{w.radionuclide}</td>
               <td className="border border-gray-300 p-2 text-black">{w.eliminationMode}</td>
               <td className="border border-gray-300 p-2 text-black">{w.exitController}</td>
             </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsersView({ users, setUsers, logAction }: any) {
  const [isAdding, setIsAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', role: 'Manipulateur', email: '', password: '' });
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (e: any) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const resetForm = () => {
    setFormData({ name: '', role: 'Manipulateur', email: '', password: '' });
    setErrorMsg('');
    setIsAdding(false);
    setEditId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    
    let defaultPermissions = ['lecture'];
    if (formData.role === 'Administrateur') defaultPermissions = ['admin_complet'];
    else if (formData.role === 'Radiopharmacien') defaultPermissions = ['lecture', 'gestion_totale'];
    else if (formData.role === 'Manipulateur' || formData.role === 'Médecin nucléaire') defaultPermissions = ['lecture', 'ajout_dechet'];

    try {
      const { db } = await import('@/lib/firebase');
      const { doc, setDoc, updateDoc } = await import('firebase/firestore');

      if (editId) {
        await updateDoc(doc(db, 'users', editId), {
          name: formData.name, 
          role: formData.role as any, 
          email: formData.email.trim().toLowerCase(),
          permissions: defaultPermissions
        });
        logAction(`Utilisateur ${formData.name} mis à jour.`);
      } else {
        const { secondaryAuth } = await import('@/lib/firebase');
        const { createUserWithEmailAndPassword } = await import('firebase/auth');
        
        const cleanEmail = formData.email.trim().toLowerCase();
        
        // Create user using secondary instance to preserve admin session
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, formData.password);
        const uid = userCredential.user.uid;

        const newUser: Partial<User> = { 
          id: uid, 
          hospitalId: 'default-hospital',
          name: formData.name, 
          role: formData.role as any, 
          email: cleanEmail,
          permissions: defaultPermissions,
          lastLogin: new Date().toISOString()
        };

        await setDoc(doc(db, 'users', uid), newUser);
        await import('firebase/auth').then(({ signOut }) => signOut(secondaryAuth));
        logAction(`Utilisateur ${formData.name} créé.`);
      }
      resetForm();
    } catch (err: any) {
      console.error("Error saving user: ", err);
      setErrorMsg(err.message || 'Error occurred');
    }
  };

  const handleEdit = (u: any) => {
    setFormData({
      name: u.name || '',
      role: u.role || 'Manipulateur',
      email: u.email || '',
      password: '' // cannot edit password this easily without admin SDK
    });
    setEditId(u.id);
    setIsAdding(true);
  };

  const handleDelete = async (id: string) => {
    if (id === 'agbotonfrejuste@gmail.com') return; // protect master admin if needed, better let's just delete the user doc
    try {
      const { db } = await import('@/lib/firebase');
      const { doc, deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'users', id));
      logAction(`Utilisateur ${id} supprimé.`);
    } catch (err) {
      console.error('Error deleting user:', err);
    }
  };

  return (
    <div className="space-y-6 flex-1 flex flex-col">
      <div className="flex justify-between items-center bg-[#15171C] p-4 rounded-xl border border-white/5">
        <div>
          <h3 className="font-bold text-white uppercase text-sm">Gestion des Utilisateurs & Droits</h3>
          <p className="text-xs text-slate-500">Personnel accrédité, accès et rôles.</p>
        </div>
        <button 
          onClick={() => { if (isAdding) resetForm(); else setIsAdding(true); }}
          className="bg-yellow-400 hover:bg-yellow-500 text-black px-4 py-2 font-black text-[10px] uppercase rounded-full transition-colors flex items-center gap-2"
        >
          {isAdding ? 'Annuler' : <><Plus className="w-3 h-3"/> Nouveau compte</>}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="bg-[#15171C] p-6 rounded-2xl border border-white/5 animate-in fade-in zoom-in-95">
          <h4 className="text-lg font-black italic uppercase mb-4 text-white">{editId ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <FormInput required label="Nom Complet" name="name" value={formData.name} onChange={handleChange} />
            <FormInput type="email" required label="Adresse Email" name="email" value={formData.email} onChange={handleChange} />
            {!editId && <FormInput type="password" required label="Mot de passe" name="password" value={formData.password} onChange={handleChange} placeholder="Minimum 6 caractères" />}
            <FormSelect required label="Rôle / Fonction" name="role" value={formData.role} onChange={handleChange} options={['Administrateur', 'Médecin nucléaire', 'Radiopharmacien', 'Manipulateur', 'Physicien médical', 'Conseiller en radioprotection']} />
          </div>
          {errorMsg && <p className="text-red-500 text-xs mb-4">{errorMsg}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={resetForm} className="px-4 py-2 border border-white/10 rounded-full font-black text-[10px] uppercase hover:bg-white/5">Annuler</button>
            <button type="submit" className="px-4 py-2 bg-yellow-400 text-black rounded-full font-black text-[10px] uppercase hover:bg-yellow-500">{editId ? 'Mettre à jour' : 'Créer l\'utilisateur'}</button>
          </div>
        </form>
      )}

      <div className="bg-[#15171C] rounded-3xl border border-white/5 overflow-hidden shrink-0">
      <table className="w-full text-left">
        <thead className="bg-[#0D0E12]">
          <tr className="text-[10px] uppercase font-black tracking-widest text-slate-500 border-b border-white/5">
            <th className="px-6 py-4">Nom & Contact</th>
            <th className="px-6 py-4">Rôle / Fonction</th>
            <th className="px-6 py-4 hidden md:table-cell">Droits Système</th>
            <th className="px-6 py-4 hidden md:table-cell">Dernière Connexion</th>
            <th className="px-6 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {users.map((u: any) => (
            <tr key={u.id} className="group hover:bg-white/[0.02]">
              <td className="px-6 py-4">
                <div className="font-bold text-white text-sm">{u.name}</div>
                <div className="text-[10px] text-slate-500">{u.email || '-'}</div>
              </td>
              <td className="px-6 py-4">
                <span className="px-3 py-1 bg-white/5 text-slate-300 text-[10px] font-black uppercase rounded-full border border-white/5">{u.role}</span>
              </td>
              <td className="px-6 py-4 hidden md:table-cell">
                <div className="flex gap-1 flex-wrap">
                  {u.permissions?.map((p: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 bg-yellow-400/10 text-yellow-400 text-[9px] font-black uppercase rounded-full border border-yellow-400/20">{p.replace('_', ' ')}</span>
                  )) || <span className="text-[10px] text-slate-600">-</span>}
                </div>
              </td>
              <td className="px-6 py-4 text-[10px] text-slate-400 font-mono hidden md:table-cell">
                {u.lastLogin ? new Date(u.lastLogin).toLocaleString('fr-FR') : 'Jamais'}
              </td>
              <td className="px-6 py-4 text-right">
                 <div className="flex items-center justify-end gap-2 transition-opacity">
                   <button onClick={() => handleEdit(u)} className="p-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors" title="Modifier">
                     <Edit2 className="w-4 h-4" />
                   </button>
                   {u.email !== 'agbotonfrejuste@gmail.com' && (
                     <button onClick={() => handleDelete(u.id)} className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors" title="Supprimer">
                       <Trash2 className="w-4 h-4" />
                     </button>
                   )}
                 </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}


function SettingsView({ wasteItems, incidents, users, actionLogs, logAction }: any) {
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);

  const handleBackup = () => {
    const data = {
      wasteItems,
      incidents,
      users,
      actionLogs
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_radwaste_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    if(logAction) logAction('Sauvegarde système téléchargée.');
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreStatus("Restauration en cours...");

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.wasteItems && data.incidents && data.users) {
           import('@/lib/firebase').then(({ db }) => {
             import('firebase/firestore').then(async ({ doc, setDoc, collection, getDocs, deleteDoc }) => {
               // Optional: wipe old data first, or just overwrite since IDs are standard
               // For safety we'll just overwrite.
               for (const item of data.wasteItems) await setDoc(doc(db, 'wasteItems', item.id), item);
               for (const inc of data.incidents) await setDoc(doc(db, 'incidents', inc.id), inc);
               for (const u of data.users) await setDoc(doc(db, 'users', u.id), u);
               if(logAction) logAction(`Restauration système effectuée (fichier: ${file.name}).`);
               setRestoreStatus("Restauration réussie !");
             });
           });
        } else {
           setRestoreStatus("Erreur: Format de fichier invalide.");
        }
      } catch (err) {
        setRestoreStatus("Erreur lors de la lecture du fichier.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 flex-1 flex flex-col">
      <div className="flex justify-between items-center bg-[#15171C] p-4 rounded-xl border border-white/5">
        <div>
          <h3 className="font-bold text-white uppercase text-sm">Paramètres Système</h3>
          <p className="text-xs text-slate-500">Configuration générale et sauvegarde des données.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-[#15171C] p-6 rounded-2xl border border-white/5">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Sauvegarde & Export</h4>
            <p className="text-sm text-slate-300 mb-6">Téléchargez une copie complète de la base de données (déchets, incidents, registre) au format JSON sécurisé.</p>
            <button onClick={handleBackup} className="px-6 py-3 bg-yellow-400 hover:bg-yellow-500 text-black rounded-lg font-black uppercase text-xs flex items-center justify-center gap-2 transition-colors w-full mb-4">
               Créer une sauvegarde maintenant
            </button>
            <div className="relative">
              <input type="file" accept=".json" onChange={handleRestore} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <button className="px-6 py-3 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg font-black uppercase text-xs flex items-center justify-center gap-2 transition-colors w-full">
                 Rétablir une sauvegarde
              </button>
            </div>
            {restoreStatus && <p className="text-xs text-yellow-400 mt-3 font-bold">{restoreStatus}</p>}
          </div>

          <div className="bg-[#15171C] p-6 rounded-2xl border border-white/5">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Préférences Affichage</h4>
            <div className="space-y-4">
               <FormSelect label="Thème Interface" name="theme" options={['Sombre (Haut contraste)', 'Sombre (Doux)']} value="Sombre (Haut contraste)" onChange={() => {}} />
               <FormSelect label="Unité de mesure par défaut" name="unit" options={['MBq', 'GBq']} value="MBq" onChange={() => {}} />
            </div>
          </div>
        </div>

        <div className="bg-[#15171C] p-6 rounded-2xl border border-white/5 flex flex-col">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex-shrink-0">Journal d&apos;actions (Logs)</h4>
          <div className="flex-1 overflow-y-auto max-h-[400px] border border-white/5 rounded-lg bg-[#0F1115] p-4 font-mono text-[10px]">
            {actionLogs && actionLogs.length > 0 ? (
              <div className="space-y-3">
                {actionLogs.map((log: any) => (
                  <div key={log.id} className="pb-3 border-b border-white/5 last:border-0 last:pb-0">
                    <span className="text-slate-500">{new Date(log.date).toLocaleString('fr-FR')}</span>
                    <span className="text-yellow-400 mx-2">|</span>
                    <span className="text-purple-400">{log.userEmail}</span>
                    <span className="text-yellow-400 mx-2">|</span>
                    <span className="text-white">{log.action}</span>
                  </div>
                ))}
              </div>
            ) : (
                <div className="text-slate-500 mb-2">Aucun log disponible...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HelpView() {
  return (
    <div className="space-y-6 flex-1 flex flex-col">
      <div className="flex justify-between items-center bg-[#15171C] p-4 rounded-xl border border-white/5">
        <div>
          <h3 className="font-bold text-white uppercase text-sm">Aide & Documentation</h3>
          <p className="text-xs text-slate-500">Manuel utilisateur de RadWaste Pro.</p>
        </div>
      </div>

      <div className="bg-[#15171C] border border-white/5 rounded-2xl p-6">
        <h3 className="text-xl font-bold text-yellow-400 mb-6">Guide de Démarrage Rapide</h3>

        <div className="space-y-8">
          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-widest mb-2 border-b border-white/10 pb-2">1. Identification & Stockage</h4>
            <p className="text-sm text-slate-300 leading-relaxed">
              Pour enregistrer un nouveau déchet dans le local de décroissance, rendez-vous dans le module &quot;Identification & Stockage&quot;.
              Précisez l&apos;isotope, l&apos;activité initiale (en MBq), et le débit de dose observé au contact et à un mètre. Le système calculera automatiquement la date théorique de libération en fonction de la demi-vie du radionucléide.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-widest mb-2 border-b border-white/10 pb-2">2. Suivi de Décroissance</h4>
            <p className="text-sm text-slate-300 leading-relaxed">
              Le tableau de bord de décroissance vous permet d&apos;un coup d&apos;œil de repérer les fûts et objets pouvant être libérés.
              Les éléments dont la date prévue de libération est atteinte ou dépassée apparaissent en surbrillance avec le statut &quot;Libérable&quot;.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-widest mb-2 border-b border-white/10 pb-2">3. Contrôle de Sortie & Élimination</h4>
            <p className="text-sm text-slate-300 leading-relaxed">
              La sortie physique de la zone de stockage contrôlée doit systématiquement être validée dans l&apos;application. 
              Le contrôleur en charge de cette procédure doit re-mesurer le débit de dose pour s&apos;assurer que ses valeurs sont en dessous des seuils réglementaires avant de valider.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-widest mb-2 border-b border-white/10 pb-2">4. Support Technique</h4>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">
              En cas de perte d&apos;accès ou de comportement inattendu, veuillez contacter l&apos;administrateur système de votre établissement (support@imena-gest.net).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------
// HELPER UI COMPONENTS
// ---------------------------

function NavButton({ active, icon, label, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${
        active 
          ? 'bg-white/5 text-white font-bold border-l-4 border-yellow-400' 
          : 'text-slate-500 hover:text-white border-l-4 border-transparent font-bold'
      }`}
    >
      <div className={`${active ? 'text-yellow-400' : 'text-slate-500'}`}>
        {icon}
      </div>
      <span className="text-sm">{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-yellow-400" />}
    </button>
  );
}

function KPICard({ title, value, icon, valueColor = 'text-white' }: any) {
  return (
    <div className="p-6 bg-[#15171C] border border-white/5 rounded-2xl flex flex-col justify-between h-32">
      <div className="flex justify-between items-start">
        <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">{title}</div>
        <div className="text-slate-600">{icon}</div>
      </div>
      <div className={`text-5xl lg:text-6xl font-black italic tracking-tighter ${valueColor}`}>{value}</div>
    </div>
  );
}

function FormInput({ label, name, value, onChange, type = 'text', placeholder, required = false, step }: any) {
  return (
    <div>
      <label className="block text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">{label}</label>
      <input type={type} name={name} value={value} onChange={onChange} required={required} placeholder={placeholder} step={step} className="w-full px-3 py-2 bg-[#0D0E12] border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-yellow-400/50 focus:border-yellow-400/50 text-white text-sm" />
    </div>
  );
}

function FormSelect({ label, name, value, onChange, options, required = false }: any) {
  return (
    <div>
      <label className="block text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-1">{label}</label>
      <select name={name} value={value} onChange={onChange} required={required} className="w-full px-3 py-2 bg-[#0D0E12] border border-white/10 rounded-lg focus:outline-none focus:ring-1 focus:ring-yellow-400/50 focus:border-yellow-400/50 text-white text-sm">
        <option value="">Sélectionner...</option>
        {options.map((o: string) => <option key={o} value={o} className="capitalize">{o}</option>)}
      </select>
    </div>
  );
}

function ReportCard({ title, description, icon, onClick }: any) {
  return (
    <div onClick={onClick} className="bg-[#15171C] p-6 rounded-2xl border border-white/5 hover:border-yellow-400/50 transition cursor-pointer group">
      <div className="w-12 h-12 rounded-xl bg-yellow-400/10 text-yellow-400 flex items-center justify-center mb-4 group-hover:bg-yellow-400 group-hover:text-black transition-colors border border-yellow-400/20 group-hover:border-yellow-400">
        {icon}
      </div>
      <h3 className="font-bold text-white mb-2">{title}</h3>
      <p className="text-xs text-slate-400 font-medium leading-relaxed mb-4">{description}</p>
      <div className="text-yellow-400 font-black uppercase text-[10px] flex items-center tracking-widest group-hover:text-yellow-300">
        Générer PDF →
      </div>
    </div>
  );
}

