'use client';

import React, { useId } from 'react';

interface FormInputProps {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  step?: string;
  min?: string;
  error?: string;
}

export function FormInput({ label, name, value, onChange, type = 'text', placeholder, required = false, step, min, error }: FormInputProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] uppercase font-bold tracking-widest text-muted mb-1">
        {label}{required && <span className="text-red-500" aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        step={step}
        min={min}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className="w-full px-3 py-2 bg-surface-2 border border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-yellow-400/50 text-primary text-sm"
      />
      {error && <p id={errorId} className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

interface FormSelectProps {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
  required?: boolean;
  error?: string;
}

export function FormSelect({ label, name, value, onChange, options, required = false, error }: FormSelectProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] uppercase font-bold tracking-widest text-muted mb-1">
        {label}{required && <span className="text-red-500" aria-hidden="true"> *</span>}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className="w-full px-3 py-2 bg-surface-2 border border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-yellow-400/50 text-primary text-sm"
      >
        <option value="">Sélectionner...</option>
        {options.map((o) => <option key={o} value={o} className="capitalize">{o}</option>)}
      </select>
      {error && <p id={errorId} className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

interface TextAreaProps {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  required?: boolean;
  rows?: number;
}

export function FormTextArea({ label, name, value, onChange, required = false, rows = 2 }: TextAreaProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] uppercase font-bold tracking-widest text-muted mb-1">
        {label}{required && <span className="text-red-500" aria-hidden="true"> *</span>}
      </label>
      <textarea
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        aria-required={required}
        rows={rows}
        className="w-full px-3 py-2 bg-surface-2 border border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-yellow-400/50 text-primary text-sm"
      />
    </div>
  );
}
