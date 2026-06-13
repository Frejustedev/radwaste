/** Échappe une valeur pour le format CSV (RFC 4180). */
function escapeCsv(value: string): string {
  if (/[",\n;]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Génère et télécharge un fichier CSV (séparateur point-virgule, compatible Excel FR),
 * précédé d'un BOM UTF-8 pour les caractères accentués.
 */
export function downloadCsv(fileName: string, headers: string[], rows: string[][]): void {
  const lines = [headers, ...rows].map((cols) => cols.map(escapeCsv).join(';'));
  const content = '﻿' + lines.join('\r\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
