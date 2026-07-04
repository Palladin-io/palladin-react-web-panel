import { useMutation } from '@tanstack/react-query'
import { decryptEntry } from '../../shared/crypto/entry-crypto'
import { wipe } from '../../shared/crypto/sodium'
import { unsealVaultKey } from '../../shared/crypto/vault-key'
import { useAuthStore } from '../auth'
import { getAllEntries, getEntry, getVault } from './api/vault-api'
import {
  toPalladinCsv,
  toPalladinJson,
  type ExportEntry,
  type ExportVault,
} from './export'
import { ENTRY_TYPE_KEY, type EntryDetail, type EntryPlaintext } from './types'
import { MissingWrappedVaultKeyError, VaultLockedError } from './use-create-entry'

export type ExportFormat = 'csv' | 'json'

export interface ExportEntriesInput {
  /** Vaults to export — each fetched fresh to obtain its wrapped VK. */
  vaults: { id: string; name: string }[]
  format: ExportFormat
}

export interface ExportEntriesResult {
  filename: string
  mime: string
  content: string
  totalEntries: number
  /** Per-vault entry counts — used to write one export-audit record per vault. */
  perVault: { id: string; count: number }[]
  format: ExportFormat
}

function toExportEntry(
  detail: EntryDetail,
  plaintext: EntryPlaintext,
  folder: string,
): ExportEntry {
  if (plaintext.type === ENTRY_TYPE_KEY) {
    return {
      name: detail.label,
      type: ENTRY_TYPE_KEY,
      value: plaintext.value,
      notes: plaintext.notes,
      folder,
    }
  }
  return {
    name: detail.label,
    type: plaintext.type,
    username: plaintext.username,
    password: plaintext.password,
    url: plaintext.url,
    notes: plaintext.notes,
    totp: plaintext.totp,
    folder,
  }
}

function timestampSlug(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Map over items with a bounded number of in-flight promises, preserving order.
 * Keeps a large export from firing N simultaneous entry-detail GETs (backend
 * spike / rate-limit risk) while staying far faster than a serial loop.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
  return results
}

/** Max concurrent entry-detail fetches during an export. */
const EXPORT_FETCH_CONCURRENCY = 8

/**
 * Decrypt and serialise vault entries for a client-side export. Everything
 * happens in the browser — the plaintext file is built from locally-decrypted
 * entries and never round-trips through the server. Each vault's VK is unsealed,
 * used, then wiped before moving to the next.
 *
 * Returns the serialised payload; the caller triggers the download and writes
 * the export-audit records. Nothing here is logged.
 */
export function useExportEntries() {
  return useMutation({
    mutationFn: async (input: ExportEntriesInput): Promise<ExportEntriesResult> => {
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new VaultLockedError()

      const exportVaults: ExportVault[] = []
      const perVault: { id: string; count: number }[] = []

      for (const target of input.vaults) {
        const vault = await getVault(target.id)
        if (!vault.wrappedVK) throw new MissingWrappedVaultKeyError()

        const vaultKey = await unsealVaultKey(vault.wrappedVK, privateKey)
        try {
          const items = await getAllEntries(target.id)
          const details = await mapWithConcurrency(
            items,
            EXPORT_FETCH_CONCURRENCY,
            (item) => getEntry(target.id, item.id),
          )
          const entries: ExportEntry[] = []
          for (const detail of details) {
            const plaintext = await decryptEntry(detail.content, vaultKey)
            entries.push(toExportEntry(detail, plaintext, target.name))
          }
          exportVaults.push({ id: target.id, name: target.name, entries })
          perVault.push({ id: target.id, count: entries.length })
        } finally {
          wipe(vaultKey)
        }
      }

      const totalEntries = perVault.reduce((sum, v) => sum + v.count, 0)
      const slug = timestampSlug()

      if (input.format === 'csv') {
        const flat = exportVaults.flatMap((v) => v.entries)
        return {
          filename: `palladin-export-${slug}.csv`,
          mime: 'text/csv;charset=utf-8',
          content: toPalladinCsv(flat),
          totalEntries,
          perVault,
          format: 'csv',
        }
      }

      return {
        filename: `palladin-export-${slug}.json`,
        mime: 'application/json',
        content: toPalladinJson(exportVaults),
        totalEntries,
        perVault,
        format: 'json',
      }
    },
  })
}
