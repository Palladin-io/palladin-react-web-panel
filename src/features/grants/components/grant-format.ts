/**
 * Formats an ISO timestamp for grant cards/detail. Returns a localised
 * short date+time; falls back to the raw string if parsing fails.
 */
export function formatGrantDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
