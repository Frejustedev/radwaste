'use client';

import React from 'react';

export function KPICard({ title, value, icon, valueClass = 'text-primary' }: { title: string; value: React.ReactNode; icon: React.ReactNode; valueClass?: string }) {
  return (
    <div className="p-6 bg-surface border border-subtle rounded-2xl flex flex-col justify-between h-32">
      <div className="flex justify-between items-start">
        <div className="text-xs text-muted font-bold uppercase tracking-wider">{title}</div>
        <div className="text-faint" aria-hidden="true">{icon}</div>
      </div>
      <div className={`text-4xl lg:text-5xl font-black italic tracking-tighter ${valueClass}`}>{value}</div>
    </div>
  );
}

export function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${
        active ? 'bg-black/5 dark:bg-white/5 text-primary font-bold border-l-4 border-yellow-400' : 'text-muted hover:text-primary border-l-4 border-transparent font-bold'
      }`}
    >
      <span className={active ? 'text-accent' : 'text-faint'} aria-hidden="true">{icon}</span>
      <span className="text-sm">{label}</span>
    </button>
  );
}

export function IconButton({ onClick, label, children, variant = 'neutral' }: { onClick: () => void; label: string; children: React.ReactNode; variant?: 'neutral' | 'danger' | 'info' }) {
  const cls = variant === 'danger'
    ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
    : variant === 'info'
      ? 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20'
      : 'bg-black/5 dark:bg-white/5 text-muted hover:text-primary';
  return (
    <button onClick={onClick} aria-label={label} title={label} className={`p-2 rounded-lg transition-colors ${cls}`}>
      {children}
    </button>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    stockage: 'bg-blue-500/20 text-blue-500',
    liberable: 'bg-green-500/20 text-green-600 animate-pulse',
    elimine: 'bg-slate-500/20 text-slate-500',
    incident: 'bg-red-500/20 text-red-500',
  };
  const label: Record<string, string> = {
    stockage: 'En stockage',
    liberable: 'Libérable',
    elimine: 'Éliminé',
    incident: 'Incident',
  };
  return (
    <span className={`px-3 py-1 text-[11px] font-black uppercase rounded-full ${map[status] ?? 'bg-slate-500/20 text-slate-500'}`}>
      {label[status] ?? status}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="p-10 text-center text-sm text-faint">{message}</div>;
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center bg-surface p-4 rounded-xl border border-subtle">
      <div>
        <h3 className="font-bold text-primary uppercase text-sm">{title}</h3>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
