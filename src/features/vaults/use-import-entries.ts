import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { getAgent } from '../agents/api/agents-api'
import { useAuthStore } from '../auth'
import { collectActiveFullGrants } from '../grants'
import { grantMethodsBits, type GrantMethod } from '../grants/grant-methods'
import { buildCanonicalGrantEnvelope } from '../../shared/crypto/grant-protocol'
import { sealCanonicalEntry } from '../../shared/crypto/entry-protocol'
import type { ParsedEntry } from './import'
import { getEntry, importEntries, issueEntryCreationChallenge, type ImportEntryItem } from './api/vault-api'
import { extractDomain } from './components/entry-presentation'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY, type EntryPlaintext, type Vault } from './types'
import { legacyInputToMemberSecret, VaultLockedError } from './use-create-entry'
import { updateCanonicalEntry } from './use-update-entry'
import { entriesQueryKey } from './use-entries'
import { vaultQueryKey } from './use-vault'
import { VAULTS_QUERY_KEY } from './use-vaults'

const IMPORT_CHUNK_SIZE = 50
export type ImportStep = 'grants' | 'encrypt' | 'save' | 'overwrite'
export class ImportStepError extends Error {
  readonly step: ImportStep
  constructor(step: ImportStep, cause: unknown) { super(`Import failed during: ${step}`, { cause }); this.name = 'ImportStepError'; this.step = step }
}
export interface ImportOverwrite { entryId: string; entry: ParsedEntry }
export interface ImportEntriesInput {
  vaultId: string; format: string; creates: ParsedEntry[]; overwrites: ImportOverwrite[]
  onProgress?: (done: number, total: number, phase: ImportPhase) => void
}
export interface ImportEntriesResult { importedCount: number; updatedCount: number; failed: { label: string; reason: string }[] }
export type ImportPhase = 'encrypt' | 'save'

async function readErrorReason(error: unknown): Promise<string> {
  if (error instanceof HTTPError) {
    try { const body = await error.response.clone().json() as { message?: string }; return body.message || error.message } catch { return error.message }
  }
  return error instanceof Error ? error.message : String(error)
}
function toPlaintext(entry: ParsedEntry): EntryPlaintext {
  return entry.type === ENTRY_TYPE_KEY
    ? { type: ENTRY_TYPE_KEY, value: entry.value ?? '', notes: entry.notes }
    : { type: ENTRY_TYPE_CREDENTIAL, username: entry.username ?? '', password: entry.password ?? '', url: entry.url, notes: entry.notes, totp: entry.totp }
}
function methods(value?: string | null): GrantMethod[] {
  return (value ?? '').split(',').map((x) => x.trim().toLowerCase()).filter((x): x is GrantMethod => x === 'get' || x === 'exec' || x === 'inject')
}

export function useImportEntries() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ImportEntriesInput): Promise<ImportEntriesResult> => {
      const auth = useAuthStore.getState()
      const vaultKey = auth.getVaultKey(input.vaultId)
      const discoveryKey = auth.getVaultDiscoveryKey(input.vaultId)
      const vault = queryClient.getQueryData<Vault>(vaultQueryKey(input.vaultId))
      if (!vaultKey || !discoveryKey || !vault) throw new VaultLockedError()
      const total = input.creates.length + input.overwrites.length
      const failed: { label: string; reason: string }[] = []
      const fullGrants = await collectActiveFullGrants(input.vaultId).catch((e) => { throw new ImportStepError('grants', e) })
      const agents = new Map(await Promise.all(fullGrants.map(async (grant) => [grant.agentId, await getAgent(grant.agentId)] as const)))
      const challenges = await issueEntryCreationChallenge(input.vaultId, input.creates.length)
      const items: ImportEntryItem[] = []
      for (let index = 0; index < input.creates.length; index++) {
        const parsed = input.creates[index]!
        const entryId = challenges.items[index]?.entryId
        if (!entryId) throw new ImportStepError('encrypt', new Error('Entry creation challenge is missing'))
        const secret = legacyInputToMemberSecret({ vaultId: input.vaultId, label: parsed.label.slice(0, 200), type: parsed.type,
          payload: toPlaintext(parsed), urlDomain: extractDomain(parsed.url)?.slice(0, 255) || undefined })
        const envelopes = await sealCanonicalEntry({ organizationId: vault.organizationId, vaultId: vault.id, entryId, revision: '1',
          vaultKeyVersion: vault.currentKeyEpoch.vaultKeyVersion, vdkVersion: vault.currentKeyEpoch.vdkVersion,
          memberKeyGeneration: vault.memberKeyGeneration }, secret, vaultKey, discoveryKey, 1)
        const grantEnvelopes = await Promise.all(fullGrants.map((grant) => {
          const agent = agents.get(grant.agentId)
          if (!agent?.publicKey) throw new Error('Active FULL grant Agent key is missing')
          return buildCanonicalGrantEnvelope({ organizationId: vault.organizationId, vaultId: vault.id, entryId,
            grantId: grant.grantId, agentId: grant.agentId, entryRevision: '1', memberKeyGeneration: vault.memberKeyGeneration,
            agentPublicKey: agent.publicKey, recipientKeyVersion: agent.recipientKeyVersion,
            approvedMethods: grantMethodsBits(methods(grant.methods)), expiresAt: grant.expiresAt ?? undefined,
            remainingUses: grant.remainingUses, secret })
        }))
        items.push({ entryId, ...envelopes, grantEnvelopes })
        input.onProgress?.(index + 1, input.creates.length, 'encrypt')
      }
      let importedCount = 0
      const saveChunk = async (chunk: ImportEntryItem[], sources: ParsedEntry[]): Promise<void> => {
        try { importedCount += (await importEntries(input.vaultId, { format: input.format, entries: chunk })).importedCount }
        catch (error) {
          if (chunk.length === 1) failed.push({ label: sources[0]!.label, reason: await readErrorReason(error) })
          else { const mid = Math.ceil(chunk.length / 2); await saveChunk(chunk.slice(0, mid), sources.slice(0, mid)); await saveChunk(chunk.slice(mid), sources.slice(mid)) }
        }
        input.onProgress?.(importedCount + failed.length, total, 'save')
      }
      for (let i = 0; i < items.length; i += IMPORT_CHUNK_SIZE) await saveChunk(items.slice(i, i + IMPORT_CHUNK_SIZE), input.creates.slice(i, i + IMPORT_CHUNK_SIZE))
      let updatedCount = 0
      for (const overwrite of input.overwrites) {
        try {
          const entry = await getEntry(input.vaultId, overwrite.entryId, vaultKey)
          const secret = legacyInputToMemberSecret({ vaultId: input.vaultId, label: overwrite.entry.label.slice(0, 200),
            type: overwrite.entry.type, payload: toPlaintext(overwrite.entry),
            urlDomain: extractDomain(overwrite.entry.url)?.slice(0, 255) || undefined })
          await updateCanonicalEntry({ vault, entry, memberSecret: secret })
          updatedCount += 1
        } catch (error) { failed.push({ label: overwrite.entry.label, reason: await readErrorReason(error) }) }
        input.onProgress?.(importedCount + updatedCount + failed.length, total, 'save')
      }
      return { importedCount, updatedCount, failed }
    },
    onSuccess: (_r, v) => {
      queryClient.invalidateQueries({ queryKey: entriesQueryKey(v.vaultId) }); queryClient.invalidateQueries({ queryKey: vaultQueryKey(v.vaultId) })
      queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY }); queryClient.invalidateQueries({ queryKey: ['entries', 'recent'] }); queryClient.invalidateQueries({ queryKey: ['search'] })
    },
  })
}
