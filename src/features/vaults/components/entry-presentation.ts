import { getDomain } from 'tldts'
import { ENTRY_TYPE_CREDIT_CARD, ENTRY_TYPE_KEY, ENTRY_TYPE_SCRIPT, type EntryType } from '../types'

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
  vpn_key: '#10B981',
  lock: '#EB4747',
  badge: '#A78BFA',
  security: '#EB4747',
  fingerprint: '#EB4747',
  password: '#8A95A6',
  enhanced_encryption: '#10B981',
  language: '#60A5FA',
  public: '#60A5FA',
  cloud: '#60A5FA',
  cloud_upload: '#60A5FA',
  api: '#10B981',
  person: '#A78BFA',
  people: '#A78BFA',
  favorite: '#EB4747',
  star: '#FFAB87',
  email: '#60A5FA',
  chat: '#10B981',
  phone: '#10B981',
  forum: '#60A5FA',
  notifications: '#60A5FA',
  database: '#8A95A6',
  folder: '#FFAB87',
  storage: '#60A5FA',
  archive: '#8A95A6',
  code: '#10B981',
  terminal: '#10B981',
  extension: '#A78BFA',
  devices: '#60A5FA',
  smartphone: '#8A95A6',
  credit_card: '#FFAB87',
  wallet: '#10B981',
  payments: '#10B981',
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

export function isCustomIconUrl(value: string | undefined): boolean {
  return typeof value === 'string' && value.startsWith('blob:')
}

/**
 * Visual identity per entry type — mirrors the Astro spec
 * (`brain/.../Entries UI.md` → "Entry Type Visual Language"
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
  iconColor: '#10B981',
  iconBg: 'rgba(16, 185, 129,0.12)',
}

const CREDENTIAL_PRESENTATION: EntryPresentation = {
  defaultIcon: 'language',
  iconColor: '#60A5FA',
  iconBg: 'rgba(96,165,250,0.12)',
}

const SCRIPT_PRESENTATION: EntryPresentation = {
  defaultIcon: 'terminal',
  iconColor: '#A78BFA',
  iconBg: 'rgba(167,139,250,0.12)',
}
const CREDIT_CARD_PRESENTATION: EntryPresentation = {
  ...CREDENTIAL_PRESENTATION,
  defaultIcon: 'credit_card',
}

export function presentationForType(type: EntryType): EntryPresentation {
  if (type === ENTRY_TYPE_KEY) return KEY_PRESENTATION
  if (type === ENTRY_TYPE_SCRIPT) return SCRIPT_PRESENTATION
  if (type === ENTRY_TYPE_CREDIT_CARD) return CREDIT_CARD_PRESENTATION
  return CREDENTIAL_PRESENTATION
}

/**
 * Extract the bare hostname from a URL string for storage in
 * `urlDomain`. Returns undefined for empty input or unparseable URLs —
 * the field is optional on the wire so we never want to block a save
 * just because the user typed a partial host.
 */
/** Google Password Manager app-credential URI: android://<signing-cert hash>@<package>/ */
const ANDROID_CREDENTIAL_URI = /^android:\/\/[^@]+@([a-z0-9_.]+)\/?$/i
const ANDROID_PACKAGE_DOMAINS: Readonly<Record<string, string>> = {
  // The reverse-DNS owner is disney.com, while the credential belongs to the
  // Disney+ product whose public identity and icon live on disneyplus.com.
  'com.disney.disneyplus': 'disneyplus.com',
}

/**
 * Derive a website domain from a reverse-DNS Android package id by reversing its
 * first two segments — `com.empik.empikapp` → `empik.com`, `com.binance.dev` →
 * `binance.com`. The candidate is validated with the public-suffix list
 * (`allowPrivateDomains` so code-hosting suffixes like `github.io` count as
 * suffixes, not domains), which rejects both packages with fewer than two
 * segments and platform-hosted apps such as `io.github.<user>` (→ `github.io`,
 * not a registrable domain) — those get no domain, exactly as before this
 * heuristic existed.
 *
 * NOTE: the domain we infer here is stored as the entry's `urlDomain`, which
 * also seeds the origin used for `inject` form-filling. That is an acceptable
 * trade-off: the value comes from the user's own password-manager export and
 * stays editable in the entry, so a wrong guess is correctable and never
 * silently binds a secret to an origin the user can't see.
 */
function domainFromAndroidPackage(packageId: string): string | undefined {
  const normalizedPackage = packageId.toLowerCase()
  const knownDomain = ANDROID_PACKAGE_DOMAINS[normalizedPackage]
  if (knownDomain) return knownDomain
  const segments = normalizedPackage.split('.')
  if (segments.length < 2) return undefined
  const candidate = `${segments[1]}.${segments[0]}`
  return getDomain(candidate, { allowPrivateDomains: true }) ?? undefined
}

export function extractDomain(rawUrl: string | undefined): string | undefined {
  const trimmed = rawUrl?.trim()
  if (!trimmed) return undefined
  const androidMatch = ANDROID_CREDENTIAL_URI.exec(trimmed)
  if (androidMatch) return domainFromAndroidPackage(androidMatch[1])
  try {
    // Add a scheme if the user typed a bare domain so URL() accepts it.
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const hostname = new URL(withScheme).hostname
    // A dotless "hostname" (stray scheme, app id) is useless as a urlDomain.
    return hostname.includes('.') ? hostname : undefined
  } catch {
    return undefined
  }
}

/**
 * Open a user-entered website value in a new tab, prepending `https://` when it
 * has no scheme. No-ops for values that don't parse as a domain — callers gate
 * the affordance on {@link extractDomain} so the button only shows for real URLs.
 */
export function openExternalUrl(raw: string | undefined): void {
  const trimmed = raw?.trim()
  if (!trimmed || !extractDomain(trimmed)) return
  const target = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  window.open(target, '_blank', 'noopener,noreferrer')
}

/** Default picker glyph for an entry type — single source for form initial state. */
export function defaultIconFor(type: number): string {
  if (type === ENTRY_TYPE_KEY) return 'vpn_key'
  if (type === ENTRY_TYPE_SCRIPT) return 'terminal'
  return 'language'
}

/** Default icon-circle colour for an entry type — used as the form default. */
export function defaultColorFor(type: EntryType): string {
  return presentationForType(type).iconColor
}
