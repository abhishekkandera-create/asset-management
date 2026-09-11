/**
 * Minimal RFC 4180 CSV writer. A value containing a comma, quote or newline is
 * quoted and its quotes doubled; a leading =, +, - or @ is prefixed with a
 * quote so spreadsheets treat it as text rather than a formula.
 */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) lines.push(row.map(escapeCell).join(','));
  return lines.join('\r\n');
}

/** Triggers a browser download of a generated CSV. */
export function downloadCsv(filename: string, csv: string): void {
  // The BOM makes Excel open UTF-8 correctly instead of mangling names.
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
