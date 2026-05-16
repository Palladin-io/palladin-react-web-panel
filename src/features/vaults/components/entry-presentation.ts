import { ENTRY_TYPE_KEY, type EntryType } from '../types'

export const ENTRY_ICON_OPTIONS = [
  // Auth / Security
  'vpn_key', 'lock', 'badge', 'security', 'fingerprint', 'password', 'enhanced_encryption',
  // Web / Network
  'language', 'public', 'cloud', 'cloud_upload', 'api',
  // People / Social
  'person', 'people', 'favorite', 'star',
  // Communication
  'email', 'chat', 'phone', 'forum', 'notifications',
  // Data / Storage
  'database', 'folder', 'storage', 'archive',
  // Dev / Tech
  'code', 'terminal', 'extension', 'devices', 'smartphone',
  // Finance
  'credit_card', 'wallet', 'payments', 'currency_bitcoin',
  // Work / Business
  'work', 'business', 'settings',
  // General
  'home', 'bookmark', 'label', 'category', 'school',
] as const

export type EntryIconOption = (typeof ENTRY_ICON_OPTIONS)[number]

export const ENTRY_ICON_COLORS: Record<string, string> = {
  vpn_key: '#2EC4B6',
  lock: '#FF4F4F',
  badge: '#A78BFA',
  security: '#FF4F4F',
  fingerprint: '#FF4F4F',
  password: '#8A95A6',
  enhanced_encryption: '#2EC4B6',
  language: '#60A5FA',
  public: '#60A5FA',
  cloud: '#60A5FA',
  cloud_upload: '#60A5FA',
  api: '#2EC4B6',
  person: '#A78BFA',
  people: '#A78BFA',
  favorite: '#FF4F4F',
  star: '#FFAB87',
  email: '#60A5FA',
  chat: '#2EC4B6',
  phone: '#2EC4B6',
  forum: '#60A5FA',
  notifications: '#60A5FA',
  database: '#8A95A6',
  folder: '#FFAB87',
  storage: '#60A5FA',
  archive: '#8A95A6',
  code: '#2EC4B6',
  terminal: '#2EC4B6',
  extension: '#A78BFA',
  devices: '#60A5FA',
  smartphone: '#8A95A6',
  credit_card: '#FFAB87',
  wallet: '#2EC4B6',
  payments: '#2EC4B6',
  currency_bitcoin: '#FFAB87',
  work: '#FFAB87',
  business: '#FFAB87',
  settings: '#8A95A6',
  home: '#A78BFA',
  bookmark: '#A78BFA',
  label: '#8A95A6',
  category: '#8A95A6',
  school: '#60A5FA',
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
