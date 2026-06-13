'use client';

import React, { useMemo, useState } from 'react';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { downloadCsv } from '@/lib/export/csv';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  /** Valeur utilisée pour le tri (rend la colonne triable si défini). */
  sortValue?: (row: T) => string | number;
  /** Texte indexé par la recherche (rend la colonne cherchable si défini). */
  searchValue?: (row: T) => string;
  /** Valeur exportée en CSV (défaut : searchValue). */
  csvValue?: (row: T) => string | number;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  searchPlaceholder?: string;
  pageSize?: number;
  emptyMessage?: string;
  /** Nom de fichier (sans extension) : affiche un bouton d'export CSV si défini. */
  exportFileName?: string;
  /** Contrôles additionnels à droite de la barre d'outils. */
  toolbar?: React.ReactNode;
}

type SortDir = 'asc' | 'desc';

const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

export function DataTable<T>({
  columns, rows, getRowKey, searchPlaceholder = 'Rechercher…', pageSize = 10, emptyMessage = 'Aucun élément.', exportFileName, toolbar,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);

  const searchable = columns.some((c) => c.searchValue);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((c) => c.searchValue && c.searchValue(row).toLowerCase().includes(q)),
    );
  }, [rows, search, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [filtered, sortKey, sortDir, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (col: Column<T>) => {
    if (!col.sortValue) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir('asc');
    }
    setPage(0);
  };

  const handleExport = () => {
    const cols = columns.filter((c) => c.csvValue || c.searchValue);
    const headers = cols.map((c) => c.header);
    const data = sorted.map((row) => cols.map((c) => String((c.csvValue ?? c.searchValue)!(row))));
    downloadCsv(`${exportFileName}.csv`, headers, data);
  };

  return (
    <div className="space-y-3">
      {(searchable || exportFileName || toolbar) && (
        <div className="flex flex-wrap items-center gap-3">
          {searchable && (
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder={searchPlaceholder}
                aria-label="Rechercher dans le tableau"
                className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-subtle rounded-lg text-primary text-sm focus:outline-none focus:ring-1 focus:ring-yellow-400/50"
              />
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            {toolbar}
            {exportFileName && sorted.length > 0 && (
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-subtle text-sm font-bold text-muted hover:text-primary hover:bg-surface-2"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                Export CSV
              </button>
            )}
          </div>
        </div>
      )}

      <div className="bg-surface border border-subtle rounded-2xl overflow-hidden">
        {sorted.length === 0 ? (
          <div className="p-10 text-center text-sm text-faint">{emptyMessage}</div>
        ) : (
          <>
            {/* Vue tableau (≥ sm) */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-subtle">
                    {columns.map((c) => (
                      <th key={c.key} scope="col" className={`px-4 py-3 font-bold uppercase text-xs tracking-wide text-muted ${alignClass[c.align ?? 'left']}`}>
                        {c.sortValue ? (
                          <button type="button" onClick={() => toggleSort(c)} className="inline-flex items-center gap-1 hover:text-primary" aria-label={`Trier par ${c.header}`}>
                            {c.header}
                            {sortKey === c.key
                              ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" aria-hidden="true" /> : <ArrowDown className="w-3 h-3" aria-hidden="true" />)
                              : <ArrowUpDown className="w-3 h-3 opacity-40" aria-hidden="true" />}
                          </button>
                        ) : c.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={getRowKey(row)} className="border-b border-subtle last:border-0 hover:bg-surface-2/50 align-top">
                      {columns.map((c) => (
                        <td key={c.key} className={`px-4 py-3 text-primary ${alignClass[c.align ?? 'left']} ${c.className ?? ''}`}>{c.render(row)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Vue cartes (mobile) */}
            <div className="sm:hidden divide-y divide-subtle">
              {pageRows.map((row) => (
                <div key={getRowKey(row)} className="p-4 space-y-2">
                  {columns.map((c) => (
                    <div key={c.key} className="flex justify-between gap-3">
                      <span className="text-xs font-bold uppercase tracking-wide text-faint shrink-0">{c.header}</span>
                      <span className="text-sm text-primary text-right">{c.render(row)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {sorted.length > pageSize && (
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} sur {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}
              className="p-2 rounded-lg border border-subtle disabled:opacity-40 hover:bg-surface-2" aria-label="Page précédente">
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <span className="px-2">{safePage + 1} / {pageCount}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}
              className="p-2 rounded-lg border border-subtle disabled:opacity-40 hover:bg-surface-2" aria-label="Page suivante">
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
