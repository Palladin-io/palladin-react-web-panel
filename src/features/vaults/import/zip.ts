import { unzipSync } from 'fflate'

/** Decompressed ZIP members keyed by their in-archive path. */
export type ZipFiles = Record<string, Uint8Array>

/** ZIP local-file-header magic bytes (`PK\x03\x04`). */
export function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  )
}

/**
 * Unzip an archive in memory, decompressing only the text members we can
 * parse. 1Password `.1pux` and Proton exports embed a `files/` directory of
 * binary attachments (potentially hundreds of MB) — the filter skips those so
 * we never inflate them into browser memory. We only ever want the data JSON
 * and any CSV/JSON members.
 */
export function unzipTextFiles(bytes: Uint8Array): ZipFiles {
  return unzipSync(bytes, {
    filter: (file) => {
      const name = file.name
      if (name.endsWith('/')) return false
      // Attachments live under a `files/` path in .1pux / Proton archives.
      if (/(^|\/)files\//i.test(name)) return false
      return (
        name.endsWith('.json') ||
        name.endsWith('.csv') ||
        name.endsWith('.data') ||
        name.endsWith('.attributes')
      )
    },
  })
}

/** Find the first member whose path ends with `suffix` (case-insensitive). */
export function findMember(files: ZipFiles, suffix: string): Uint8Array | undefined {
  const lower = suffix.toLowerCase()
  const key = Object.keys(files).find((name) => name.toLowerCase().endsWith(lower))
  return key ? files[key] : undefined
}

export function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}
