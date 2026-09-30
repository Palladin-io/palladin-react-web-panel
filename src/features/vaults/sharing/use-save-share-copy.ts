import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../auth'
import { organizationIdFromAccessToken } from '../../../shared/lib/organization-scope'
import { PERMISSION_VAULT_MANAGE } from '../../../shared/lib/permissions'
import type { EntryShareSnapshot } from '../../../shared/crypto/entry-share'
import { entryShareCopySecret, type EntryShareCopyForm } from '../../../shared/crypto/entry-share-copy'
import { readEntryShareCopyVaultName, sealEntryShareCopy } from '../../../shared/crypto/entry-share-copy-encryption'
import { listEncryptedVaults, getEncryptedVault } from '../sync/member-sync-api'
import { createEntry, createVault, issueEntryCreationChallenge, issueVaultCreationChallenge, type CreateVaultPayload } from '../api/vault-api'
import { useMemberSyncStore } from '../sync/member-sync-store'
import { createVaultProtocolPayload } from '../../../shared/crypto/create-vault-protocol'
import { createDefaultVault, getAccount } from '../../../shared/api/account-api'
import { DEFAULT_VAULT_COLOR, DEFAULT_VAULT_ICON } from '../../../shared/lib/create-default-vault-safe'

interface CopyVault { id: string; name: string | null }
export interface SavedShareCopy { vaultId: string; entryId: string }
interface CopyOperation {
  controller: AbortController
  auth: Pick<ReturnType<typeof useAuthStore.getState>, 'userId' | 'privateKey' | 'cryptoSessionGeneration'>
  organizationId: string | null
  busy: boolean
  request?: { vaultId: string; body: Parameters<typeof createEntry>[1] }
  pendingVault?: { name: string; payload: CreateVaultPayload; isDefault: boolean }
  saved: boolean
}

function current(operation: CopyOperation): boolean {
  const auth = useAuthStore.getState()
  return !operation.controller.signal.aborted && !auth.isVaultLocked && auth.emailVerified && !!auth.userId && !!auth.privateKey
    && auth.privateKey === operation.auth.privateKey && auth.userId === operation.auth.userId
    && auth.cryptoSessionGeneration === operation.auth.cryptoSessionGeneration
    && !!operation.organizationId && organizationIdFromAccessToken(auth.accessToken) === operation.organizationId
    && (auth.permissions & PERMISSION_VAULT_MANAGE) !== 0
}

async function loadVaultChoices(operation: CopyOperation): Promise<CopyVault[] | null> {
  const encrypted = await listEncryptedVaults(operation.controller.signal)
  const choices: CopyVault[] = []
  for (const vault of encrypted) {
    if (!current(operation)) return null
    let name: string | null = null
    try {
      name = await readEntryShareCopyVaultName({ ...vault, organizationId: operation.organizationId! },
        { organizationId: operation.organizationId!, memberId: operation.auth.userId!, vaultId: vault.id },
        operation.auth.privateKey!, operation.controller.signal)
    } catch { /* A corrupt Vault must not hide unrelated authenticated choices. */ }
    if (!current(operation)) return null
    choices.push({ id: vault.id, name })
  }
  return current(operation) ? choices : null
}

export function useSaveShareCopy(snapshot: EntryShareSnapshot) {
  const [vaults, setVaults] = useState<CopyVault[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [retryPending, setRetryPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const operationRef = useRef<CopyOperation | null>(null)

  useEffect(() => {
    const { userId, privateKey, cryptoSessionGeneration, accessToken } = useAuthStore.getState()
    const operation: CopyOperation = { controller: new AbortController(), auth: { userId, privateKey, cryptoSessionGeneration },
      organizationId: organizationIdFromAccessToken(accessToken), busy: false, saved: false }
    operationRef.current = operation
    const dispose = () => { operation.controller.abort(); operation.request = undefined; operation.pendingVault = undefined }
    const invalidate = () => { dispose(); setVaults([]); setLoadError(true); setLoading(false); setBusy(false); setRetryPending(false) }
    const unsubscribe = useAuthStore.subscribe(() => { if (!current(operation)) invalidate() })
    window.addEventListener('pagehide', invalidate)
    void (async () => {
      try {
        if (!current(operation)) throw new Error()
        const choices = await loadVaultChoices(operation)
        if (choices && current(operation)) setVaults(choices)
      } catch { if (!operation.controller.signal.aborted) setLoadError(true) }
      finally { if (!operation.controller.signal.aborted) setLoading(false) }
    })()
    return () => { unsubscribe(); window.removeEventListener('pagehide', invalidate); dispose() }
  }, [attempt])

  async function createNamedVault(name: string): Promise<{ vaultId: string } | 'failed' | 'cancelled'> {
    const operation = operationRef.current
    if (!operation || !current(operation) || operation.busy || operation.saved || operation.request
      || loading || loadError || !name.trim() || name.length > 64) return 'cancelled'
    const normalizedName = name.trim().normalize('NFC')
    if (operation.pendingVault && operation.pendingVault.name !== normalizedName) return 'failed'
    operation.busy = true; setBusy(true)
    try {
      if (!operation.pendingVault) {
        const [challenge, account] = await Promise.all([
          issueVaultCreationChallenge(operation.controller.signal), getAccount(),
        ])
        if (!current(operation)) return 'cancelled'
        if (account.userId !== operation.auth.userId || !account.memberKeyVersion) return 'failed'
        const payload = await createVaultProtocolPayload({
          organizationId: operation.organizationId!, vaultId: challenge.vaultId,
          memberId: operation.auth.userId!, memberKeyVersion: account.memberKeyVersion,
          memberPrivateKey: operation.auth.privateKey!,
          metadata: { schema: 'palladin.member-vault-metadata.v1', name: normalizedName,
            description: null, icon: vaults.length === 0 ? { kind: 'glyph', value: DEFAULT_VAULT_ICON } : null,
            color: vaults.length === 0 ? DEFAULT_VAULT_COLOR : null, grantMode: 'granular' },
        })
        if (!current(operation)) return 'cancelled'
        operation.pendingVault = { name: normalizedName, payload, isDefault: vaults.length === 0 }
      }
      const pending = operation.pendingVault
      try {
        if (pending.isDefault) await createDefaultVault(pending.payload, operation.controller.signal)
        else await createVault(pending.payload, operation.controller.signal)
      }
      catch { if (!current(operation)) return 'cancelled' }
      if (!current(operation)) return 'cancelled'
      const choices = await loadVaultChoices(operation)
      if (!choices || !current(operation)) return 'cancelled'
      setVaults(choices)
      if (!choices.some((vault) => vault.id === pending.payload.vaultId && vault.name === pending.name)) return 'failed'
      operation.pendingVault = undefined
      useMemberSyncStore.getState().retry()
      return { vaultId: pending.payload.vaultId }
    } catch { return current(operation) ? 'failed' : 'cancelled' }
    finally { operation.busy = false; if (current(operation)) setBusy(false) }
  }

  async function save(vaultId: string, form: EntryShareCopyForm, newlyCreatedVaultId?: string): Promise<SavedShareCopy | 'failed' | 'cancelled'> {
    const operation = operationRef.current
    if (!operation || !current(operation) || operation.busy || operation.saved) return 'cancelled'
    operation.busy = true; setBusy(true)
    try {
      if (!operation.request) {
        // A Vault created from this dialog may not yet be in React's last render.
        // Confirm its ID against the authenticated, locally decrypted directory.
        if (!vaults.some((vault) => vault.id === vaultId && vault.name !== null)) {
          if (newlyCreatedVaultId !== vaultId) throw new Error()
          const choices = await loadVaultChoices(operation)
          if (!choices || !current(operation)) return 'cancelled'
          setVaults(choices)
          if (!choices.some((vault) => vault.id === vaultId && vault.name !== null)) throw new Error()
        }
        const secret = entryShareCopySecret(snapshot, form)
        const [vault, challenge] = await Promise.all([getEncryptedVault(vaultId, operation.controller.signal),
          issueEntryCreationChallenge(vaultId, operation.controller.signal)])
        if (!current(operation)) return 'cancelled'
        const material = await sealEntryShareCopy(secret, vault, { vaultId, entryId: challenge.entryId,
          organizationId: operation.organizationId!, memberId: operation.auth.userId! }, operation.auth.privateKey!, operation.controller.signal)
        if (!current(operation)) return 'cancelled'
        operation.request = { vaultId, body: { entryId: challenge.entryId, ...material,
          deliveryPolicy: snapshot.entryType === 'script' ? 'execOnly' : snapshot.entryType === 'creditCard' ? 'injectOnly' : 'standard' } }
      }
      if (!current(operation)) return 'cancelled'
      await createEntry(operation.request.vaultId, operation.request.body, operation.controller.signal)
      if (!current(operation)) return 'cancelled'
      const savedEntry = { vaultId: operation.request.vaultId, entryId: operation.request.body.entryId }
      operation.saved = true; operation.request = undefined
      setSaved(true); setRetryPending(false)
      useMemberSyncStore.getState().retry()
      return savedEntry
    } catch {
      if (!current(operation)) return 'cancelled'
      setRetryPending(!!operation.request)
      return 'failed'
    } finally { operation.busy = false; if (current(operation)) setBusy(false) }
  }

  function retryLoad() { setVaults([]); setLoading(true); setLoadError(false); setAttempt((value) => value + 1) }
  return { vaults, loading, loadError, busy, retryPending, saved, save, retryLoad, createNamedVault }
}
