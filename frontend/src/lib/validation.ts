/**
 * Accepts 10-digit Indian mobile numbers, optionally prefixed with +91, 91 or 0.
 * Returns the normalised "+91 XXXXXXXXXX" form, or null if invalid.
 */
export function normalizeMobile(input: string): string | null {
  const compact = input.replace(/[\s\-()]/g, '');
  const match = compact.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
  return match ? `+91 ${match[1]}` : null;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}
