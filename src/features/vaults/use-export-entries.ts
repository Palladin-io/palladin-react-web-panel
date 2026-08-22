import { useAuthenticatedMutation as useMutation } from '../auth'
import { openMemberSecret } from '../../shared/crypto/entry-protocol'
import { fromMemberSecret, type MemberSecretView } from '../../shared/crypto/entry-draft'
import { openMemberVaultKey } from '../../shared/crypto/vault-protocol'
import { wipe } from '../../shared/crypto/sodium'
import { useAuthStore } from '../auth'
import { getCanonicalEntry, getEntryHistory, type CanonicalEntryDetail } from './api/vault-api'
import { toPalladinCsv, toPalladinJson, type ExportEntry, type ExportVault } from './export'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_CREDIT_CARD, ENTRY_TYPE_KEY, ENTRY_TYPE_SCRIPT } from './types'
import { getEncryptedVault } from './sync/member-sync-api'
import { useMemberSyncStore, type MemberEntryState } from './sync/member-sync-store'

export type ExportFormat = 'csv' | 'json'

export interface ExportEntriesInput {
  vaults: { id: string; name: string }[]
  format: ExportFormat
  includeArchived: boolean
  includeDeleted: boolean
  includeHistory: boolean
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
  /** Called synchronously while the plaintext byte buffer is live. */
  onFileReady: (file: { filename: string; mime: string; content: Uint8Array }) => void
}

export interface ExportEntriesResult {
  totalEntries: number
  perVault: { id: string; count: number }[]
  format: ExportFormat
}

export class ExportProjectionUnavailableError extends Error {
  constructor() {
    super('A selected Entry does not have a valid unlocked Member projection')
    this.name = 'ExportProjectionUnavailableError'
  }
}

const EXPORT_FETCH_CONCURRENCY = 8
const MAXIMUM_EXPORT_ENTRIES = 20_000
const MAXIMUM_HISTORY_VERSIONS_PER_ENTRY = 100
const MAXIMUM_EXPORT_ROWS = 50_000

function throwIfCancelled(signal: AbortSignal | undefined, privateKey: Uint8Array) {
  signal?.throwIfAborted()
  if (useAuthStore.getState().privateKey !== privateKey) throw new DOMException('Vault locked', 'AbortError')
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  signal: AbortSignal | undefined,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      signal?.throwIfAborted()
      const index = cursor++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function selectedStates(input: ExportEntriesInput): ReadonlySet<MemberEntryState> {
  return new Set<MemberEntryState>([
    'active',
    ...(input.includeArchived ? ['archived' as const] : []),
    ...(input.includeDeleted ? ['deleted' as const] : []),
  ])
}

function toExportEntry(
  secret: MemberSecretView,
  folder: string,
  state: MemberEntryState,
  revision: string,
  historical = false,
): ExportEntry {
  const common = {
    name: secret.memberLabel,
    type: secret.entryType,
    notes: secret.content.notes,
    folder,
    state,
    revision,
    ...(historical ? { historical: true } : {}),
  }
  if (secret.content.type === ENTRY_TYPE_KEY) return { ...common, value: secret.content.value }
  if (secret.content.type === ENTRY_TYPE_SCRIPT) return { ...common, value: secret.content.script }
  if (secret.content.type === ENTRY_TYPE_CREDIT_CARD) return {
    ...common,
    cardholderName: secret.content.cardholderName,
    cardNumber: secret.content.cardNumber,
    expiryMonth: secret.content.expiryMonth,
    expiryYear: secret.content.expiryYear,
    billingAddress: secret.content.billingAddress,
  }
  if (secret.content.type !== ENTRY_TYPE_CREDENTIAL) throw new ExportProjectionUnavailableError()
  return {
    ...common,
    username: secret.content.username,
    password: secret.content.password,
    url: secret.content.url,
    totp: secret.content.totp,
  }
}

async function loadHistory(
  detail: CanonicalEntryDetail,
  vaultKey: Uint8Array,
  folder: string,
  state: MemberEntryState,
  signal: AbortSignal | undefined,
): Promise<ExportEntry[]> {
  const rows: ExportEntry[] = []
  const cursors = new Set<string>()
  let beforeRevision: string | undefined
  do {
    signal?.throwIfAborted()
    const page = await getEntryHistory(detail.vaultId, detail.id, beforeRevision, signal)
    for (const item of page.items) {
      if (item.revision === detail.currentRevision) continue
      if (rows.length >= MAXIMUM_HISTORY_VERSIONS_PER_ENTRY) {
        throw new ExportProjectionUnavailableError()
      }
      const secret = await openMemberSecret(item.entryKey, item.memberSecret, vaultKey, {
        organizationId: detail.organizationId, vaultId: detail.vaultId,
        entryId: detail.id, revision: item.revision,
      })
      rows.push(toExportEntry(fromMemberSecret(secret), folder, state, item.revision, true))
    }
    const next = page.nextBeforeRevision ?? undefined
    if (next && (!cursors.add(next) || next === beforeRevision)) throw new ExportProjectionUnavailableError()
    beforeRevision = next
  } while (beforeRevision)
  return rows
}

function clearPlaintext(vaults: ExportVault[]) {
  for (const vault of vaults) {
    vault.name = ''
    for (const entry of vault.entries) {
      entry.name = ''
      entry.username = ''
      entry.password = ''
      entry.value = ''
      entry.url = ''
      entry.notes = ''
      entry.totp = ''
      entry.cardholderName = ''
      entry.cardNumber = ''
      entry.expiryMonth = ''
      entry.expiryYear = ''
      entry.billingAddress = ''
      entry.folder = ''
    }
    vault.entries.length = 0
  }
  vaults.length = 0
}

function timestampSlug(): string {
  return new Date().toISOString().slice(0, 10)
}

export function useExportEntries() {
  return useMutation({
    mutationFn: async (input: ExportEntriesInput): Promise<ExportEntriesResult> => {
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new DOMException('Vault locked', 'AbortError')
      throwIfCancelled(input.signal, privateKey)

      const states = selectedStates(input)
      const store = useMemberSyncStore.getState()
      const selected = input.vaults.map((target) => {
        const vault = store.vaults.get(target.id)
        if (!vault?.metadata || vault.status !== 'ready') throw new ExportProjectionUnavailableError()
        const entries = [...vault.entries.values()].filter((entry) => states.has(entry.state))
        if (entries.some((entry) => entry.corrupt || !entry.payload)) throw new ExportProjectionUnavailableError()
        return { target, vault, metadata: vault.metadata, entries }
      })
      const currentCount = selected.reduce((sum, item) => sum + item.entries.length, 0)
      if (currentCount > MAXIMUM_EXPORT_ENTRIES) throw new ExportProjectionUnavailableError()

      let done = 0
      let total = currentCount
      input.onProgress?.(0, total)
      const exportVaults: ExportVault[] = []
      const perVault: { id: string; count: number }[] = []
      let fileBytes: Uint8Array | undefined

      try {
        for (const { target, metadata, entries } of selected) {
          throwIfCancelled(input.signal, privateKey)
          const encryptedVault = await getEncryptedVault(target.id, input.signal)
          const vaultKey = await openMemberVaultKey(encryptedVault.memberVaultKey, privateKey)
          try {
            const rows = await mapWithConcurrency(
              entries,
              EXPORT_FETCH_CONCURRENCY,
              input.signal,
              async (record) => {
                throwIfCancelled(input.signal, privateKey)
                const detail = await getCanonicalEntry(target.id, record.entryId, input.signal)
                const secret = await openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
                  organizationId: detail.organizationId, vaultId: detail.vaultId,
                  entryId: detail.id, revision: detail.currentRevision,
                })
                const result = [toExportEntry(
                  fromMemberSecret(secret),
                  metadata.name,
                  record.state,
                  detail.currentRevision,
                )]
                input.onProgress?.(++done, total)
                if (input.includeHistory) {
                  const history = await loadHistory(
                    detail,
                    vaultKey,
                    metadata.name,
                    record.state,
                    input.signal,
                  )
                  total += history.length
                  result.push(...history)
                  done += history.length
                  input.onProgress?.(done, total)
                }
                return result
              },
            )
            const flat = rows.flat()
            if (exportVaults.reduce((sum, item) => sum + item.entries.length, 0) + flat.length
              > MAXIMUM_EXPORT_ROWS) throw new ExportProjectionUnavailableError()
            exportVaults.push({ id: target.id, name: metadata.name, entries: flat })
            perVault.push({ id: target.id, count: flat.length })
          } finally {
            wipe(vaultKey)
          }
        }

        throwIfCancelled(input.signal, privateKey)
        const slug = timestampSlug()
        const filename = `palladin-export-${slug}.${input.format}`
        const mime = input.format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json'
        const serialized = input.format === 'csv'
          ? toPalladinCsv(exportVaults.flatMap((vault) => vault.entries))
          : toPalladinJson(exportVaults)
        fileBytes = new TextEncoder().encode(serialized)
        input.onFileReady({ filename, mime, content: fileBytes })
        return {
          totalEntries: perVault.reduce((sum, item) => sum + item.count, 0),
          perVault,
          format: input.format,
        }
      } finally {
        if (fileBytes) wipe(fileBytes)
        clearPlaintext(exportVaults)
      }
    },
    gcTime: 0,
  })
}
