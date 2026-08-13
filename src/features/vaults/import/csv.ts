import Papa from 'papaparse'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_CREDIT_CARD } from '../types'
import { normalizeEntry, type RawEntry } from './normalize'
import type {
  ColumnMapping,
  CsvRow,
  ImportFormat,
  MappableField,
  ParsedEntry,
  SkippedTally,
  UnmappedCsv,
} from './types'

/** Parsed CSV: header names (lowercased+trimmed) plus row objects keyed by them. */
export interface ParsedCsv {
  headers: string[]
  rows: CsvRow[]
}

/**
 * Parse CSV text into lowercase-keyed rows. Header names are lowercased and
 * trimmed so downstream signature matching and field mapping stay
 * case-insensitive; a leading BOM is stripped by PapaParse's default handling.
 * Empty rows are dropped.
 */
export function parseCsv(text: string): ParsedCsv {
  // Strip a leading UTF-8 BOM so it cannot prefix the first header name.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const result = Papa.parse<CsvRow>(body, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  })
  const headers = (result.meta.fields ?? []).map((h) => h.trim().toLowerCase())
  return { headers, rows: result.data }
}

/** First non-empty value among candidate columns (already lowercased keys). */
function pick(row: CsvRow, candidates: string[] | undefined): string | undefined {
  if (!candidates) return undefined
  for (const key of candidates) {
    const value = row[key]
    if (value != null && value.trim().length > 0) return value
  }
  return undefined
}

type FieldColumns = Partial<Record<MappableField | 'value', string[]>>

/**
 * Declarative CSV format profile. Adding a flat-CSV format means adding one of
 * these — never a new parser. `signature` lists headers that must ALL be present
 * (lowercased) for a match; `map` points each Palladin field at candidate source
 * columns, first non-empty wins.
 */
export interface CsvProfile {
  id: ImportFormat
  signature: string[]
  map: FieldColumns
}

/**
 * Ordered most-specific signature first. Detection walks this list and takes the
 * first profile whose every signature column is present — so `palladin-csv`
 * (adds `totp`+`folder`) and the vendor formats win before the `generic-csv`
 * fallback, which matches the bare `name,url,username,password` header.
 */
export const CSV_PROFILES: CsvProfile[] = [
  {
    id: 'firefox-csv',
    signature: ['url', 'username', 'password', 'httprealm', 'formactionorigin', 'guid'],
    map: { url: ['url'], username: ['username'], password: ['password'] },
  },
  {
    id: 'dashlane-csv',
    signature: ['title', 'password', 'otpsecret', 'username2'],
    map: {
      label: ['title'],
      username: ['username', 'username2', 'username3'],
      password: ['password'],
      url: ['url'],
      notes: ['note'],
      totp: ['otpsecret'],
    },
  },
  {
    id: 'lastpass-csv',
    signature: ['url', 'username', 'password', 'extra', 'grouping', 'fav'],
    map: {
      label: ['name'],
      username: ['username'],
      password: ['password'],
      url: ['url'],
      notes: ['extra'],
      totp: ['totp'],
    },
  },
  {
    id: 'bitwarden-csv',
    signature: ['name', 'login_uri', 'login_username', 'login_password'],
    map: {
      label: ['name'],
      username: ['login_username'],
      password: ['login_password'],
      url: ['login_uri'],
      notes: ['notes'],
      totp: ['login_totp'],
    },
  },
  {
    id: '1password-csv',
    signature: ['title', 'url', 'username', 'password', 'otpauth', 'archived', 'tags'],
    map: {
      label: ['title'],
      username: ['username'],
      password: ['password'],
      url: ['url'],
      notes: ['notes'],
      totp: ['otpauth'],
    },
  },
  {
    id: 'safari-csv',
    signature: ['title', 'url', 'username', 'password', 'otpauth'],
    map: {
      label: ['title'],
      username: ['username'],
      password: ['password'],
      url: ['url'],
      notes: ['notes'],
      totp: ['otpauth'],
    },
  },
  {
    id: 'roboform-csv',
    signature: ['name', 'url', 'login', 'pwd'],
    map: {
      label: ['name'],
      username: ['login'],
      password: ['pwd'],
      url: ['url'],
      notes: ['note'],
    },
  },
  {
    id: 'palladin-csv',
    signature: ['name', 'url', 'username', 'password', 'totp', 'folder'],
    map: {
      label: ['name'],
      username: ['username'],
      password: ['password'],
      url: ['url'],
      notes: ['note', 'notes'],
      totp: ['totp'],
    },
  },
  {
    id: 'nordpass-csv',
    signature: ['name', 'url', 'username', 'password', 'cardholdername', 'folder'],
    map: {
      label: ['name'],
      username: ['username'],
      password: ['password'],
      url: ['url'],
      notes: ['note'],
    },
  },
  {
    id: 'generic-csv',
    signature: ['name', 'url', 'username', 'password'],
    map: {
      label: ['name'],
      username: ['username'],
      password: ['password'],
      url: ['url'],
      notes: ['note', 'notes'],
    },
  },
]

/** True when every signature column is present in the parsed header row. */
export function matchesCsvProfile(headers: string[], profile: CsvProfile): boolean {
  const set = new Set(headers)
  return profile.signature.every((col) => set.has(col))
}

/** First CSV profile whose signature matches, or null for the manual mapper. */
export function detectCsvProfile(headers: string[]): CsvProfile | null {
  return CSV_PROFILES.find((p) => matchesCsvProfile(headers, p)) ?? null
}

function rawFromColumns(row: CsvRow, map: FieldColumns): RawEntry {
  return {
    type: ENTRY_TYPE_CREDENTIAL,
    label: pick(row, map.label),
    username: pick(row, map.username),
    password: pick(row, map.password),
    url: pick(row, map.url),
    notes: pick(row, map.notes),
    totp: pick(row, map.totp),
  }
}

function collect(
  rows: CsvRow[],
  toRaw: (row: CsvRow) => RawEntry,
): { entries: ParsedEntry[]; skipped: SkippedTally } {
  const entries: ParsedEntry[] = []
  const skipped: SkippedTally = { count: 0, reasons: {} }
  for (const row of rows) {
    const entry = normalizeEntry(toRaw(row))
    if (entry) {
      entries.push(entry)
    } else {
      skipped.count += 1
      skipped.reasons.nonLogin = (skipped.reasons.nonLogin ?? 0) + 1
    }
  }
  return { entries, skipped }
}

/** Extract entries from CSV rows using a matched profile's column map. */
export function extractCsvProfile(
  rows: CsvRow[],
  profile: CsvProfile,
): { entries: ParsedEntry[]; skipped: SkippedTally } {
  if (profile.id === 'palladin-csv') return collect(rows, (row) => {
    if (row.type === String(ENTRY_TYPE_CREDIT_CARD) || row.type?.trim().toLowerCase() === 'creditcard') return {
      type: ENTRY_TYPE_CREDIT_CARD, label: row.name, notes: row.note,
      cardholderName: row.cardholdername, cardNumber: row.cardnumber,
      expiryMonth: row.expirymonth, expiryYear: row.expiryyear,
      securityCode: row.securitycode, pin: row.pin, billingAddress: row.billingaddress,
    }
    return rawFromColumns(row, profile.map)
  })
  if (profile.id === 'nordpass-csv') return collect(rows, (row) => {
    if (row.cardnumber?.trim()) {
      const expiry = row.expirydate?.trim().match(/^(0?[1-9]|1[0-2])\s*\/\s*(\d{2}|\d{4})$/)
      const expiryYear = expiry?.[2].length === 2 ? `20${expiry[2]}` : expiry?.[2]
      return {
        type: ENTRY_TYPE_CREDIT_CARD,
        label: row.name,
        notes: row.note,
        cardholderName: row.cardholdername,
        cardNumber: row.cardnumber,
        expiryMonth: expiry?.[1].padStart(2, '0'),
        expiryYear,
        securityCode: row.cvc,
      }
    }
    return rawFromColumns(row, profile.map)
  })
  return collect(rows, (row) => rawFromColumns(row, profile.map))
}

/**
 * Extract entries from an unmatched CSV using the user's manual column mapping.
 * A mapping with no label column falls back to the URL host (via normalisation).
 */
export function applyColumnMapping(
  unmapped: UnmappedCsv,
  mapping: ColumnMapping,
): { entries: ParsedEntry[]; skipped: SkippedTally } {
  const toColumns = (field: MappableField): string[] | undefined =>
    mapping[field] ? [mapping[field] as string] : undefined
  return collect(unmapped.rows, (row) => ({
    type: ENTRY_TYPE_CREDENTIAL,
    label: pick(row, toColumns('label')),
    username: pick(row, toColumns('username')),
    password: pick(row, toColumns('password')),
    url: pick(row, toColumns('url')),
    notes: pick(row, toColumns('notes')),
    totp: pick(row, toColumns('totp')),
  }))
}
