'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  notify: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((kind: ToastKind, message: string) => {
    const id = ++counter;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => remove(id), 6000);
  }, [remove]);

  const success = useCallback((message: string) => notify('success', message), [notify]);
  const error = useCallback((message: string) => notify('error', message), [notify]);

  return (
    <ToastContext.Provider value={{ notify, success, error }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-3 p-4 rounded-xl shadow-2xl border text-sm bg-surface border-subtle text-primary ${
              t.kind === 'error' ? 'border-l-4 border-l-red-500' : t.kind === 'success' ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-blue-500'
            }`}
          >
            {t.kind === 'error'
              ? <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
              : <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" aria-hidden="true" />}
            <span className="flex-1 leading-snug">{t.message}</span>
            <button onClick={() => remove(t.id)} className="text-faint hover:text-primary" aria-label="Fermer la notification">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast doit être utilisé dans un ToastProvider');
  return ctx;
}
