import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../auth'
import { organizationIdFromAccessToken } from '../../../shared/lib/organization-scope'
import { PERMISSION_VAULT_MANAGE } from '../../../shared/lib/permissions'
import type { EntryShareSnapshot } from '../../../shared/crypto/entry-share'
import { entryShareCopySecret, type EntryShareCopyForm } from '../../../shared/crypto/entry-share-copy'
import { readEntryShareCopyVaultName, sealEntryShareCopy } from '../../../shared/crypto/entry-share-copy-encryption'
import { listEncryptedVaults, getEncryptedVault } from '../sync/member-sync-api'
import { createEntry, issueEntryCreationChallenge } from '../api/vault-api'
import { useMemberSyncStore } from '../sync/member-sync-store'
import { createDefaultVaultSafe } from '../../../shared/lib/create-default-vault-safe'
import i18n from '../../../shared/lib/i18n'

interface CopyVault { id: string; name: string | null }
interface CopyOperation {
  controller: AbortController
  auth: Pick<ReturnType<typeof useAuthStore.getState>, 'userId' | 'privateKey' | 'cryptoSessionGeneration'>
  organizationId: string | null
  busy: boolean
  request?: { vaultId: string; body: Parameters<typeof createEntry>[1] }
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
    const dispose = () => { operation.controller.abort(); operation.request = undefined }
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

  async function prepareVault(): Promise<'ready' | 'failed' | 'cancelled'> {
    const operation = operationRef.current
    if (!operation || !current(operation) || operation.busy || operation.saved || operation.request
      || loading || loadError || vaults.length) return 'cancelled'
    operation.busy = true; setBusy(true)
    try {
      const outcome = await createDefaultVaultSafe(operation.auth.privateKey!, i18n.t('vault.defaultName'), operation.controller.signal)
      if (!current(operation)) return 'cancelled'
      if (outcome === 'failed') return 'failed'
      const choices = await loadVaultChoices(operation)
      if (!choices || !current(operation)) return 'cancelled'
      setVaults(choices)
      useMemberSyncStore.getState().retry()
      return choices.some((vault) => vault.name !== null) ? 'ready' : 'failed'
    } catch { return current(operation) ? 'failed' : 'cancelled' }
    finally { operation.busy = false; if (current(operation)) setBusy(false) }
  }

  async function save(vaultId: string, form: EntryShareCopyForm): Promise<'saved' | 'failed' | 'cancelled'> {
    const operation = operationRef.current
    if (!operation || !current(operation) || operation.busy || operation.saved) return 'cancelled'
    operation.busy = true; setBusy(true)
    try {
      if (!operation.request) {
        if (!vaults.some((vault) => vault.id === vaultId && vault.name !== null)) throw new Error()
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
      operation.saved = true; operation.request = undefined
      setSaved(true); setRetryPending(false)
      useMemberSyncStore.getState().retry()
      return 'saved'
    } catch {
      if (!current(operation)) return 'cancelled'
      setRetryPending(!!operation.request)
      return 'failed'
    } finally { operation.busy = false; if (current(operation)) setBusy(false) }
  }

  function retryLoad() { setVaults([]); setLoading(true); setLoadError(false); setAttempt((value) => value + 1) }
  return { vaults, loading, loadError, busy, retryPending, saved, save, retryLoad, prepareVault }
}
