import {
  detectCsvProfile,
  extractCsvProfile,
  parseCsv,
} from './csv'
import {
  collectRaw,
  detectJsonProfile,
  extractOnePasswordData,
} from './json'
import { extractKeePassXml, isKeePassXml } from './keepass'
import { ImportParseError, type ParseResult } from './types'
import {
  decodeText,
  findMember,
  isZip,
  unzipTextFiles,
  type ZipFiles,
} from './zip'

/**
 * Parse an uploaded file into importable entries. Detection is by structure, not
 * extension (users rename files): ZIP magic bytes first, then JSON, then KeePass
 * XML, then CSV by header signature. An unrecognised CSV returns a `manual`
 * result carrying the raw rows for the column-mapper; anything else throws an
 * {@link ImportParseError} the wizard maps to a message.
 */
export async function parseFile(file: File): Promise<ParseResult> {
  const buffer = new Uint8Array(await file.arrayBuffer())
  return parseBytes(buffer)
}

/** Structure-based parse of raw bytes. Split out so tests can drive it directly. */
export function parseBytes(bytes: Uint8Array): ParseResult {
  if (isZip(bytes)) {
    return parseZip(unzipTextFiles(bytes))
  }
  return parseText(decodeText(bytes))
}

/** Parse decoded text (JSON → KeePass XML → CSV). */
export function parseText(text: string): ParseResult {
  const trimmed = text.trimStart()

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const data = tryParseJson(trimmed)
    if (data !== undefined) return parseJsonData(data)
  }

  if (isKeePassXml(text)) {
    const { entries, skipped } = collectRaw(extractKeePassXml(text))
    return { entries, skipped, format: 'keepass-xml' }
  }

  return parseCsvText(text)
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function parseJsonData(data: unknown): ParseResult {
  const profile = detectJsonProfile(data)
  if (!profile) {
    throw new ImportParseError('Unrecognised JSON structure', 'unsupportedJson')
  }
  const { entries, skipped } = collectRaw(profile.extract(data))
  return { entries, skipped, format: profile.id }
}

function parseCsvText(text: string): ParseResult {
  const { headers, rows } = parseCsv(text)
  if (headers.length === 0 || rows.length === 0) {
    throw new ImportParseError('File is empty or not a supported format', 'unrecognised')
  }
  const profile = detectCsvProfile(headers)
  if (!profile) {
    // No signature matched — hand the raw CSV to the column-mapper.
    return {
      entries: [],
      skipped: { count: 0, reasons: {} },
      format: 'manual',
      unmapped: { headers, rows },
    }
  }
  const { entries, skipped } = extractCsvProfile(rows, profile)
  return { entries, skipped, format: profile.id }
}

function parseZip(files: ZipFiles): ParseResult {
  // 1Password .1pux — the whole export lives in export.data.
  const exportData = findMember(files, 'export.data')
  if (exportData) {
    const data = tryParseJson(decodeText(exportData))
    if (data === undefined) {
      throw new ImportParseError('1Password export.data is not valid JSON', 'unsupportedJson')
    }
    const { entries, skipped } = collectRaw(extractOnePasswordData(data))
    return { entries, skipped, format: '1password-1pux' }
  }

  // Dashlane — credentials.csv alongside other category CSVs. Reuses the
  // dashlane CSV profile's mapping but reports the ZIP-specific format id.
  const credentials = findMember(files, 'credentials.csv')
  if (credentials) {
    const { headers, rows } = parseCsv(decodeText(credentials))
    const profile = detectCsvProfile(headers)
    if (profile) {
      const { entries, skipped } = extractCsvProfile(rows, profile)
      return { entries, skipped, format: 'dashlane-zip' }
    }
  }

  // A single JSON member (e.g. Proton Pass export) → run JSON detection.
  const jsonName = Object.keys(files).find((n) => n.toLowerCase().endsWith('.json'))
  if (jsonName) {
    const data = tryParseJson(decodeText(files[jsonName]))
    if (data !== undefined) return parseJsonData(data)
  }

  // A single CSV member → run CSV detection / fall to the manual mapper.
  const csvName = Object.keys(files).find((n) => n.toLowerCase().endsWith('.csv'))
  if (csvName) {
    return parseCsvText(decodeText(files[csvName]))
  }

  throw new ImportParseError('Archive has no importable file', 'unrecognisedArchive')
}
