/**
 * Format ISO YYYY-MM-DD string to DD/MM/YYYY
 */
export function formatToDDMMYYYY(isoStr) {
  if (!isoStr || typeof isoStr !== 'string') return '';
  const clean = isoStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return '';
  const [y, m, d] = parts;
  if (!y || !m || !d) return '';
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

/**
 * Parse DD/MM/YYYY string to ISO YYYY-MM-DD
 * Returns null if invalid.
 */
export function parseFromDDMMYYYY(displayStr) {
  if (!displayStr || typeof displayStr !== 'string') return null;
  const parts = displayStr.trim().split(/[/.-]/);
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const y = parseInt(parts[2], 10);

  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  if (y < 2000 || y > 2099) return null;

  // Validate days in month
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  if (
    dateObj.getUTCFullYear() !== y ||
    dateObj.getUTCMonth() !== m - 1 ||
    dateObj.getUTCDate() !== d
  ) {
    return null;
  }

  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}
