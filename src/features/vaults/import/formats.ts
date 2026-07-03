import type { ImportFormat } from './types'

/**
 * Human-facing name per format. These are product/brand proper nouns
 * (Bitwarden, 1Password…) that read identically in every locale, so they live
 * as constants rather than i18n copy — only surrounding UI chrome is translated.
 */
export const FORMAT_NAMES: Record<ImportFormat, string> = {
  'generic-csv': 'Chrome / Edge / Brave (CSV)',
  firefox: 'Firefox (CSV)',
  safari: 'Safari / iCloud Keychain (CSV)',
  lastpass: 'LastPass (CSV)',
  'bitwarden-json': 'Bitwarden (JSON)',
  'bitwarden-csv': 'Bitwarden (CSV)',
  'onepassword-csv': '1Password (CSV)',
  'onepassword-1pux': '1Password (.1pux)',
  dashlane: 'Dashlane (CSV / ZIP)',
  'keepass-xml': 'KeePass 2 (XML)',
  nordpass: 'NordPass (CSV)',
  'keeper-json': 'Keeper (JSON)',
  roboform: 'RoboForm (CSV)',
  'protonpass-json': 'Proton Pass (JSON / ZIP)',
  'palladin-json': 'Palladin (JSON)',
  'palladin-csv': 'Palladin (CSV)',
  manual: 'Custom CSV (manual mapping)',
}

/** Order shown in the "Supported formats" hint on the upload step. */
export const SUPPORTED_FORMAT_NAMES: string[] = [
  'Chrome / Edge / Brave',
  'Firefox',
  'Safari / iCloud',
  'Bitwarden',
  'LastPass',
  '1Password',
  'Dashlane',
  'KeePass',
  'NordPass',
  'Keeper',
  'RoboForm',
  'Proton Pass',
  'Palladin',
]

export function formatName(format: ImportFormat): string {
  return FORMAT_NAMES[format]
}
