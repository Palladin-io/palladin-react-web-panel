import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_CREDIT_CARD } from '../types'
import { extractDomain } from '../components/entry-presentation'
import type { ParsedEntry } from './types'

/**
 * A loosely-typed entry as produced by a format extractor, before normalisation.
 * Extractors fill whatever fields the source carries; `normalizeEntry` trims
 * them, canonicalises the TOTP seed, and back-fills a label from the URL host.
 */
export interface RawEntry {
  label?: string
  type?: ParsedEntry['type']
  username?: string
  password?: string
  value?: string
  url?: string
  notes?: string
  totp?: string
  cardholderName?: string
  cardNumber?: string
  cvv?: string
  expiryMonth?: string
  expiryYear?: string
  billingAddress?: string
}

function clean(value: string | undefined | null): string | undefined {
  if (value == null) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * A bare Base32 secret (Dashlane `otpSecret`, some Bitwarden exports) contains
 * only the RFC 4648 alphabet, optionally with padding or grouping spaces.
 */
function looksLikeBareSecret(value: string): boolean {
  return /^[A-Z2-7\s=]+$/i.test(value) && /[A-Z2-7]/i.test(value)
}

/**
 * Canonicalise a TOTP seed to a full `otpauth://` URI. Full URIs (Safari,
 * 1Password, Bitwarden, KeePass) pass through untouched; a bare Base32 secret is
 * wrapped with the entry label as the account and the URL host as the issuer.
 * Returns undefined for anything that is neither, so a stray value never becomes
 * a broken authenticator entry.
 */
export function normalizeTotp(
  raw: string | undefined,
  label: string,
  host: string | undefined,
): string | undefined {
  const value = clean(raw)
  if (!value) return undefined
  if (/^otpauth:\/\//i.test(value)) return value
  const secret = value.replace(/\s+/g, '')
  if (!looksLikeBareSecret(secret)) return undefined
  const account = encodeURIComponent(label || 'Palladin')
  const params = new URLSearchParams({ secret: secret.toUpperCase() })
  if (host) params.set('issuer', host)
  return `otpauth://totp/${account}?${params.toString()}`
}

/**
 * Normalise a raw extractor entry: trim every field, derive a label from the URL
 * host when the source has no title (Firefox), and canonicalise the TOTP seed.
 * Returns null when the entry carries no usable secret material (no password,
 * value, or username) — the caller counts those as skipped.
 */
export function normalizeEntry(raw: RawEntry): ParsedEntry | null {
  const url = clean(raw.url)
  const host = extractDomain(url)
  const label = clean(raw.label) || host || 'Untitled'

  const type = raw.type ?? ENTRY_TYPE_CREDENTIAL
  const username = clean(raw.username)
  const password = clean(raw.password)
  const value = clean(raw.value)
  const notes = clean(raw.notes)
  const totp = normalizeTotp(raw.totp, label, host)
  if (type === ENTRY_TYPE_CREDIT_CARD) {
    const cardholderName = clean(raw.cardholderName)
    const cardNumber = clean(raw.cardNumber)?.replace(/[ -]/g, '')
    const cvv = clean(raw.cvv)
    if (cvv && !/^\d{3,4}$/.test(cvv)) return null
    const expiryMonth = clean(raw.expiryMonth)
    const expiryYear = clean(raw.expiryYear)
    if (!cardholderName || cardholderName.length > 256
      || !cardNumber || !/^\d{12,19}$/.test(cardNumber)
      || !expiryMonth || !/^(0[1-9]|1[0-2])$/.test(expiryMonth)
      || !expiryYear || !/^\d{4}$/.test(expiryYear)) return null
    return { label, type, cardholderName, cardNumber, cvv, expiryMonth, expiryYear,
      billingAddress: clean(raw.billingAddress), notes }
  }

  if (type === ENTRY_TYPE_CREDENTIAL) {
    // A login needs at least a username or a password to be worth importing;
    // note-only / url-only rows (secure notes, cards) are dropped by the caller.
    if (!username && !password && !totp) return null
    return {
      label,
      type: ENTRY_TYPE_CREDENTIAL,
      username,
      password,
      url,
      notes,
      totp,
    }
  }

  if (!value) return null
  return { label, type, value, notes }
}
