import { ENTRY_TYPE_CREDENTIAL } from '../types'
import type { RawEntry } from './normalize'

/** True when the text parses as a KeePass 2.x XML export (`<KeePassFile>` root). */
export function isKeePassXml(text: string): boolean {
  const trimmed = text.trimStart()
  if (!trimmed.startsWith('<')) return false
  return /<KeePassFile[\s>]/.test(trimmed)
}

// KeePass String keys are case-sensitive and standard; TOTP lives under one of
// several non-standard keys depending on the plugin that wrote it.
const TOTP_KEYS = ['otp', 'TOTP Seed', 'TimeOtp-Secret-Base32', 'TOTP']

/**
 * Extract login entries from a KeePass 2.x XML export. Each `<Entry>` carries a
 * flat list of `<String><Key>…</Key><Value>…</Value></String>` pairs; we read
 * the standard Title/UserName/Password/URL/Notes keys plus the first TOTP-ish
 * key. Group nesting is ignored (Palladin has no folders yet).
 */
export function extractKeePassXml(text: string): RawEntry[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('KeePass XML is malformed')
  }

  const out: RawEntry[] = []
  for (const entry of Array.from(doc.querySelectorAll('Entry'))) {
    // Skip <Entry> nodes nested in <History> — those are past revisions.
    if (entry.closest('History')) continue

    const fields = new Map<string, string>()
    for (const stringNode of Array.from(entry.querySelectorAll(':scope > String'))) {
      const key = stringNode.querySelector('Key')?.textContent ?? ''
      const value = stringNode.querySelector('Value')?.textContent ?? ''
      if (key) fields.set(key, value)
    }

    let totp: string | undefined
    for (const key of TOTP_KEYS) {
      const value = fields.get(key)
      if (value) {
        totp = value
        break
      }
    }

    out.push({
      type: ENTRY_TYPE_CREDENTIAL,
      label: fields.get('Title'),
      username: fields.get('UserName'),
      password: fields.get('Password'),
      url: fields.get('URL'),
      notes: fields.get('Notes'),
      totp,
    })
  }
  return out
}
