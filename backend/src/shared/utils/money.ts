/**
 * All monetary amounts are stored as integer paisa (1 BDT = 100 paisa)
 * to eliminate floating point drift. Convert at the API boundary.
 */

export function toPaisa(bdt: number): number {
  return Math.round(bdt * 100);
}

export function toBdt(paisa: number): number {
  return paisa / 100;
}

export function formatBdt(paisa: number): string {
  return `৳${toBdt(paisa).toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Parse a user-entered BDT amount string/number into paisa, or null if invalid. */
export function parseBdtToPaisa(input: string | number): number | null {
  const n = typeof input === 'string' ? Number(input.replace(/[^0-9.]/g, '')) : input;
  if (!Number.isFinite(n) || n <= 0) return null;
  return toPaisa(n);
}

/** Round a computed PnL (in paisa, may be fractional) to the nearest paisa. */
export function roundPaisa(value: number): number {
  return Math.round(value);
}
