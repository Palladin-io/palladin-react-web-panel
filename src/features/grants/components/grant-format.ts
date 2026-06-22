import type { TFunction } from 'i18next'

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

/**
 * Relative time ("just now", "2h ago", "3d ago") for the "Requested" row.
 * Buckets translate via i18n plural keys so EN/PL read naturally. Falls back
 * to an absolute short date for anything older than a month, or the raw string
 * if the timestamp is unparseable.
 */
export function formatRelativeTime(iso: string, t: TFunction): string {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return iso

  const minutes = Math.floor((Date.now() - ts) / 60_000)
  if (minutes < 1) return t('grants.relative.justNow')
  if (minutes < 60) return t('grants.relative.minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('grants.relative.hoursAgo', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return t('grants.relative.daysAgo', { count: days })
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Forward-looking "expires in 3d / 5h / 12m"; "expired" when already past.
 * Falls back to the raw string if unparseable.
 */
export function formatExpiresIn(iso: string, t: TFunction): string {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return iso
  const minutes = Math.floor((ts - Date.now()) / 60_000)
  if (minutes <= 0) return t('grants.remaining.expired')
  if (minutes < 60) return t('grants.remaining.expiresInMinutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('grants.remaining.expiresInHours', { count: hours })
  const days = Math.floor(hours / 24)
  return t('grants.remaining.expiresInDays', { count: days })
}

/**
 * Verbose forward-looking distance ("in 30 minutes / 5 hours / 3 days / 2 months")
 * for the grant-policy expiry summary. Unlike `formatExpiresIn` (compact "3d"),
 * this spells the unit out and rolls up to months for long spans.
 */
export function formatExpiresInLong(iso: string, t: TFunction): string {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return iso
  // Round (not floor): a value set to exactly now+24h is already a few ms in the
  // past by render time, which would floor to "23 hours" — round keeps it "24h".
  const minutes = Math.round((ts - Date.now()) / 60_000)
  if (minutes <= 0) return t('grants.remaining.expired')
  if (minutes < 60) return t('grants.approve.expiresRelMinutes', { count: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('grants.approve.expiresRelHours', { count: hours })
  const days = Math.round(hours / 24)
  if (days < 30) return t('grants.approve.expiresRelDays', { count: days })
  return t('grants.approve.expiresRelMonths', { count: Math.round(days / 30) })
}

/** Time bucket for grouping the org-grants list. */
export type TimeBucket = 'today' | 'week' | 'older'

export function timeBucket(iso: string, now: Date = new Date()): TimeBucket {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return 'older'
  const ageDays = (now.getTime() - ts) / 86_400_000
  const sameDay = new Date(ts).toDateString() === now.toDateString()
  if (sameDay) return 'today'
  if (ageDays < 7) return 'week'
  return 'older'
}
