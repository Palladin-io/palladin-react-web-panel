import type { EntryType } from '../types'

/**
 * Stable identifiers for every source format the wizard understands. The
 * `manual` id marks a CSV that fell through auto-detection and needs the
 * column-mapper; `palladin-json` / `palladin-csv` are our own exports so a
 * round-trip re-import is lossless (JSON) or best-effort (CSV).
 */
// Ids mirror the backend format catalog so the `format` field lands consistently
// in analytics (`be:vault:entries-imported`) and the audit log. `manual` is
// web-only (column-mapper fallback) and has no backend catalog entry.
export type ImportFormat =
  | 'generic-csv'
  | 'firefox-csv'
  | 'safari-csv'
  | 'lastpass-csv'
  | 'bitwarden-json'
  | 'bitwarden-csv'
  | '1password-csv'
  | '1password-1pux'
  | 'dashlane-zip'
  | 'dashlane-csv'
  | 'keepass-xml'
  | 'nordpass-csv'
  | 'keeper-json'
  | 'roboform-csv'
  | 'protonpass-json'
  | 'palladin-json'
  | 'palladin-csv'
  | 'manual'

/**
 * A single entry recovered from a source file, before it is encrypted. Fields
 * are already `.trim()`-ed and TOTP is normalised to an `otpauth://` URI. `value`
 * is only populated for KEY-type entries (Palladin JSON round-trip); every other
 * source produces CREDENTIAL entries.
 */
export interface ParsedEntry {
  label: string
  type: EntryType
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

/** Non-login rows we deliberately drop, tallied by reason for the preview step. */
export interface SkippedTally {
  count: number
  reasons: Record<string, number>
}

/**
 * Result of parsing a file: the importable entries, a tally of what was skipped
 * and why, and the detected format. When detection falls through to the manual
 * mapper, `unmapped` carries the raw CSV so the column-mapper UI can render it.
 */
export interface ParseResult {
  entries: ParsedEntry[]
  skipped: SkippedTally
  format: ImportFormat
  unmapped?: UnmappedCsv
}

/** Raw CSV handed to the column-mapper when no profile matched. */
export interface UnmappedCsv {
  headers: string[]
  /** Row objects keyed by the (lowercased) header. */
  rows: CsvRow[]
}

/** A CSV row keyed by lowercased, trimmed header name. */
export type CsvRow = Record<string, string>

/** The set of Palladin fields a CSV column can be mapped onto. */
export type MappableField =
  | 'label'
  | 'username'
  | 'password'
  | 'url'
  | 'notes'
  | 'totp'

/** User-chosen column → field assignment from the manual mapper. */
export type ColumnMapping = Partial<Record<MappableField, string>>

export class ImportParseError extends Error {
  /** Machine-readable reason surfaced to analytics (never contains secrets). */
  readonly reason: string

  constructor(message: string, reason: string) {
    super(message)
    this.name = 'ImportParseError'
    this.reason = reason
  }
}
