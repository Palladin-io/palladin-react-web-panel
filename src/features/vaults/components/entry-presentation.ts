import { ENTRY_TYPE_KEY, type EntryType } from '../types'

export const ENTRY_ICON_OPTIONS = [
  'vpn_key',
  'language',
  'person',
  'email',
  'database',
  'cloud',
  'credit_card',
  'badge',
  'lock',
  'smartphone',
] as const

export type EntryIconOption = (typeof ENTRY_ICON_OPTIONS)[number]

export const ENTRY_ICON_COLORS: Record<string, string> = {
  vpn_key: '#2EC4B6',
  language: '#60A5FA',
  person: '#A78BFA',
  email: '#60A5FA',
  database: '#8A95A6',
  cloud: '#60A5FA',
  credit_card: '#FFAB87',
  badge: '#A78BFA',
  lock: '#FF4F4F',
  smartphone: '#8A95A6',
}

export function isCustomIconUrl(value: string | undefined): value is string {
  return typeof value === 'string' && (value.startsWith('https://') || value.startsWith('blob:'))
}

/**
 * Visual identity per entry type — mirrors the Astro spec
 * (`docs/obsidian/.../Entries UI.md` → "Entry Type Visual Language"
 * table). KEY entries get a teal icon-circle, CREDENTIAL entries get
 * a blue one. The default Material glyph is used unless the user
 * picked a custom icon.
 */
export interface EntryPresentation {
  defaultIcon: string
  iconColor: string
  iconBg: string
}

const KEY_PRESENTATION: EntryPresentation = {
  defaultIcon: 'vpn_key',
  iconColor: '#2EC4B6',
  iconBg: 'rgba(46,196,182,0.12)',
}

const CREDENTIAL_PRESENTATION: EntryPresentation = {
  defaultIcon: 'language',
  iconColor: '#60A5FA',
  iconBg: 'rgba(96,165,250,0.12)',
}

export function presentationForType(type: EntryType): EntryPresentation {
  return type === ENTRY_TYPE_KEY ? KEY_PRESENTATION : CREDENTIAL_PRESENTATION
}

/**
 * Extract the bare hostname from a URL string for storage in
 * `urlDomain`. Returns undefined for empty input or unparseable URLs —
 * the field is optional on the wire so we never want to block a save
 * just because the user typed a partial host.
 */
export function extractDomain(rawUrl: string | undefined): string | undefined {
  const trimmed = rawUrl?.trim()
  if (!trimmed) return undefined
  try {
    // Add a scheme if the user typed a bare domain so URL() accepts it.
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    return new URL(withScheme).hostname || undefined
  } catch {
    return undefined
  }
}
