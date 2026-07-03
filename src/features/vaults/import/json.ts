import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY } from '../types'
import { normalizeEntry, type RawEntry } from './normalize'
import type { ImportFormat, ParsedEntry, SkippedTally } from './types'

/**
 * A JSON source profile: a structural `detect` on the parsed root plus an
 * `extract` that maps it to raw entries. Adding a JSON format is one more entry
 * here — the parser (`JSON.parse`) is shared, only the shape mapping differs.
 */
export interface JsonProfile {
  id: ImportFormat
  detect: (data: unknown) => boolean
  extract: (data: unknown) => RawEntry[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

// ── Bitwarden (unencrypted JSON) ───────────────────────────────────────────
// { encrypted:false, folders|collections:[], items:[{ type, name, notes,
//   login:{ uris:[{uri}], username, password, totp } }] }
const bitwarden: JsonProfile = {
  id: 'bitwarden-json',
  detect: (data) =>
    isObject(data) &&
    Array.isArray(data.items) &&
    (Array.isArray(data.folders) || Array.isArray(data.collections)),
  extract: (data) => {
    if (!isObject(data) || !Array.isArray(data.items)) return []
    return data.items.map((item): RawEntry => {
      if (!isObject(item)) return {}
      const login = isObject(item.login) ? item.login : undefined
      const uris = login && Array.isArray(login.uris) ? login.uris : []
      const firstUri = uris.length > 0 && isObject(uris[0]) ? str(uris[0].uri) : undefined
      // type 1 = login; note/card/identity have no login block, so username /
      // password / totp stay undefined and the row is dropped downstream for
      // lack of secret material — no explicit type check needed.
      return {
        type: ENTRY_TYPE_CREDENTIAL,
        label: str(item.name),
        username: login ? str(login.username) : undefined,
        password: login ? str(login.password) : undefined,
        url: firstUri,
        notes: str(item.notes),
        totp: login ? str(login.totp) : undefined,
      }
    })
  },
}

// ── Keeper (JSON) ──────────────────────────────────────────────────────────
// { records:[{ title, login, password, login_url, notes }], shared_folders:[] }
const keeper: JsonProfile = {
  id: 'keeper-json',
  detect: (data) =>
    isObject(data) &&
    Array.isArray(data.records) &&
    data.records.some((r) => isObject(r) && 'login_url' in r),
  extract: (data) => {
    if (!isObject(data) || !Array.isArray(data.records)) return []
    return data.records.map((rec): RawEntry => {
      if (!isObject(rec)) return {}
      return {
        type: ENTRY_TYPE_CREDENTIAL,
        label: str(rec.title),
        username: str(rec.login),
        password: str(rec.password),
        url: str(rec.login_url),
        notes: str(rec.notes),
      }
    })
  },
}

// ── Proton Pass (JSON) ─────────────────────────────────────────────────────
// { version, vaults:{ <id>:{ name, items:[{ data:{ metadata:{name,note},
//   content:{ itemUsername|username, itemEmail|email, password, urls:[], totpUri } } }] } } }
const protonpass: JsonProfile = {
  id: 'protonpass-json',
  detect: (data) => {
    if (!isObject(data) || !isObject(data.vaults)) return false
    return Object.values(data.vaults).some(
      (v) =>
        isObject(v) &&
        Array.isArray(v.items) &&
        v.items.some((i) => isObject(i) && isObject(i.data) && isObject(i.data.metadata)),
    )
  },
  extract: (data) => {
    if (!isObject(data) || !isObject(data.vaults)) return []
    const out: RawEntry[] = []
    for (const vault of Object.values(data.vaults)) {
      if (!isObject(vault) || !Array.isArray(vault.items)) continue
      for (const item of vault.items) {
        if (!isObject(item) || !isObject(item.data)) continue
        const metadata = isObject(item.data.metadata) ? item.data.metadata : {}
        const content = isObject(item.data.content) ? item.data.content : {}
        const urls = Array.isArray(content.urls) ? content.urls : []
        out.push({
          type: ENTRY_TYPE_CREDENTIAL,
          label: str(metadata.name),
          // Login is in username, else falls back to the email field.
          username: str(content.itemUsername) ?? str(content.username) ?? str(content.itemEmail) ?? str(content.email),
          password: str(content.password),
          url: str(urls[0]),
          notes: str(metadata.note),
          totp: str(content.totpUri),
        })
      }
    }
    return out
  },
}

// ── 1Password (loose export.data JSON — usually inside a .1pux) ─────────────
// { accounts:[{ vaults:[{ items:[{ overview:{title,url,urls}, details:{
//   loginFields:[{value,designation}], notesPlain, sections:[{fields:[]}] } }] }] }] }
const onepasswordJson: JsonProfile = {
  id: 'onepassword-1pux',
  detect: (data) =>
    isObject(data) &&
    Array.isArray(data.accounts) &&
    data.accounts.some(
      (a) => isObject(a) && Array.isArray(a.vaults),
    ),
  extract: (data) => extractOnePasswordData(data),
}

/**
 * Shared 1Password `export.data` mapper — used both for a loose JSON export and
 * for the `export.data` file unpacked from a `.1pux` ZIP.
 */
export function extractOnePasswordData(data: unknown): RawEntry[] {
  if (!isObject(data) || !Array.isArray(data.accounts)) return []
  const out: RawEntry[] = []
  for (const account of data.accounts) {
    if (!isObject(account) || !Array.isArray(account.vaults)) continue
    for (const vault of account.vaults) {
      if (!isObject(vault) || !Array.isArray(vault.items)) continue
      for (const item of vault.items) {
        if (!isObject(item)) continue
        if (item.state != null && item.state !== 'active') continue
        const overview = isObject(item.overview) ? item.overview : {}
        const details = isObject(item.details) ? item.details : {}
        const loginFields = Array.isArray(details.loginFields) ? details.loginFields : []
        let username: string | undefined
        let password: string | undefined
        for (const field of loginFields) {
          if (!isObject(field)) continue
          if (field.designation === 'username') username = str(field.value)
          if (field.designation === 'password') password = str(field.value)
        }
        const urls = Array.isArray(overview.urls) ? overview.urls : []
        const firstUrl = str(overview.url) ?? (isObject(urls[0]) ? str(urls[0].url) : undefined)
        out.push({
          type: ENTRY_TYPE_CREDENTIAL,
          label: str(overview.title),
          username,
          password,
          url: firstUrl,
          notes: str(details.notesPlain),
          totp: findOnePasswordTotp(details.sections),
        })
      }
    }
  }
  return out
}

function findOnePasswordTotp(sections: unknown): string | undefined {
  if (!Array.isArray(sections)) return undefined
  for (const section of sections) {
    if (!isObject(section) || !Array.isArray(section.fields)) continue
    for (const field of section.fields) {
      if (!isObject(field)) continue
      const value = str(field.value)
      const id = str(field.id)
      if (value && (/^otpauth:\/\//i.test(value) || id?.startsWith('TOTP_'))) {
        return value
      }
    }
  }
  return undefined
}

// ── Palladin (native JSON) ─────────────────────────────────────────────────
// { version:1, vaults:[{ entries:[{ name, username, password, urlDomain,
//   notes, totp, value, type }] }] } — lossless round-trip of our own export.
const palladin: JsonProfile = {
  id: 'palladin-json',
  detect: (data) =>
    isObject(data) &&
    data.version === 1 &&
    Array.isArray(data.vaults) &&
    data.vaults.every((v) => isObject(v) && Array.isArray(v.entries)),
  extract: (data) => {
    if (!isObject(data) || !Array.isArray(data.vaults)) return []
    const out: RawEntry[] = []
    for (const vault of data.vaults) {
      if (!isObject(vault) || !Array.isArray(vault.entries)) continue
      for (const entry of vault.entries) {
        if (!isObject(entry)) continue
        const isKey = entry.type === ENTRY_TYPE_KEY || entry.type === 'key'
        out.push({
          type: isKey ? ENTRY_TYPE_KEY : ENTRY_TYPE_CREDENTIAL,
          label: str(entry.name),
          username: str(entry.username),
          password: str(entry.password),
          value: str(entry.value),
          url: str(entry.urlDomain) ?? str(entry.url),
          notes: str(entry.notes),
          totp: str(entry.totp),
        })
      }
    }
    return out
  },
}

/** Ordered most-specific first — Proton's object-shaped `vaults` before the rest. */
export const JSON_PROFILES: JsonProfile[] = [
  palladin,
  protonpass,
  bitwarden,
  keeper,
  onepasswordJson,
]

export function detectJsonProfile(data: unknown): JsonProfile | null {
  return JSON_PROFILES.find((p) => p.detect(data)) ?? null
}

/** Normalise a profile's raw entries, tallying rows dropped for no secret material. */
export function collectRaw(raws: RawEntry[]): {
  entries: ParsedEntry[]
  skipped: SkippedTally
} {
  const entries: ParsedEntry[] = []
  const skipped: SkippedTally = { count: 0, reasons: {} }
  for (const raw of raws) {
    const entry = normalizeEntry(raw)
    if (entry) {
      entries.push(entry)
    } else {
      skipped.count += 1
      skipped.reasons.nonLogin = (skipped.reasons.nonLogin ?? 0) + 1
    }
  }
  return { entries, skipped }
}
