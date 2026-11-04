/** "2026-10-12" -> "12-10-2026". Returns "NA" for empty values. */
export function formatDate(iso: string | null): string {
  if (!iso) return 'NA';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
}

/** Today's date in the user's local timezone as YYYY-MM-DD. */
export function todayISO(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}
