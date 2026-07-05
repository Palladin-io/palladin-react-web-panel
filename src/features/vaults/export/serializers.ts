import { ENTRY_TYPE_CREDENTIAL, type EntryType } from '../types'

/**
 * A decrypted entry ready for export. `value` holds a KEY entry's single secret;
 * `username`/`password` hold a CREDENTIAL. `folder` is the owning vault name,
 * used as the CSV `folder` column.
 */
export interface ExportEntry {
  name: string
  type: EntryType
  username?: string
  password?: string
  value?: string
  url?: string
  notes?: string
  totp?: string
  folder?: string
}

export interface ExportVault {
  id: string
  name: string
  entries: ExportEntry[]
}

const CSV_HEADERS = ['name', 'url', 'username', 'password', 'note', 'totp', 'folder']

/** Quote a field per RFC 4180 when it contains a delimiter, quote, or newline. */
function csvField(value: string | undefined): string {
  const raw = value ?? ''
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

/**
 * Serialise entries to Palladin CSV — a superset of the generic
 * `name,url,username,password,note` header (importable 1:1 into Chrome /
 * Bitwarden) plus `totp,folder`, which importers that don't know them ignore.
 *
 * KEY entries have no username/password, so their single secret is written to
 * the `password` column — the round-trip-lossless representation lives in the
 * JSON export, not here.
 */
export function toPalladinCsv(entries: ExportEntry[]): string {
  const lines = [CSV_HEADERS.join(',')]
  for (const entry of entries) {
    // KEY and SCRIPT carry their secret in `value`; CREDENTIAL in `password`.
    const password = entry.type === ENTRY_TYPE_CREDENTIAL ? entry.password : entry.value
    lines.push(
      [
        csvField(entry.name),
        csvField(entry.url),
        csvField(entry.username),
        csvField(password),
        csvField(entry.notes),
        csvField(entry.totp),
        csvField(entry.folder),
      ].join(','),
    )
  }
  // RFC 4180 uses CRLF line breaks.
  return lines.join('\r\n')
}

/**
 * Serialise vaults to the native Palladin JSON schema (v1). Field names mirror
 * our entry model (`urlDomain`, `totp`, `value`, numeric `type`) so re-importing
 * through the `palladin-json` profile is lossless. The file is plaintext —
 * `encrypted:false` is explicit so a future encrypted variant is distinguishable.
 */
export function toPalladinJson(vaults: ExportVault[]): string {
  const payload = {
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    encrypted: false as const,
    vaults: vaults.map((vault) => ({
      id: vault.id,
      name: vault.name,
      entries: vault.entries.map((entry) => ({
        name: entry.name,
        type: entry.type,
        username: entry.username,
        password: entry.password,
        value: entry.value,
        urlDomain: entry.url,
        notes: entry.notes,
        totp: entry.totp,
      })),
    })),
  }
  return JSON.stringify(payload, null, 2)
}
