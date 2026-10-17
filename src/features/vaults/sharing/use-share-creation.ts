import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../auth'
import { organizationIdFromAccessToken } from '../../../shared/lib/organization-scope'
import { PERMISSION_VAULT_MANAGE } from '../../../shared/lib/permissions'
import { prepareEntryShare, type PreparedEntryShare } from '../../../shared/crypto/entry-share'
import { clearEntryShareLink, entryShareFragment, entrySharePath } from '../../../shared/crypto/entry-share-link'
import { createEntryShareSnapshot } from '../../../shared/crypto/entry-share-selection'
import { encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import type { MemberSecretV1 } from '../../../shared/crypto/vault-plaintext'
import { openCurrentMemberEntrySecret } from '../sync/current-member-entry-reader'
import { useMemberSyncStore } from '../sync/member-sync-store'
import { createEntryShare, issueShareCreationChallenge, type CreateEntryShareInput } from './sharing-api'
import { sharingFormSchema, sharingRecipients, type SharingForm } from './sharing-form'

export interface CreatedShareLink { recipientEmail: string | null; link: string }

export interface ShareSourceScope {
  organizationId: string
  vaultId: string
  entryId: string
  revision: string
  keyVersion: number
}

interface SharingOperation {
  controller: AbortController
  auth: Pick<ReturnType<typeof useAuthStore.getState>, 'userId' | 'privateKey' | 'cryptoSessionGeneration'>
  material?: PreparedEntryShare
  request?: CreateEntryShareInput
  recipients?: Array<string | null>
  choices?: SharingForm
  nextRecipient: number
  submitting: boolean
}

function dispose(operation: SharingOperation): void {
  operation.controller.abort()
  if (operation.material) clearEntryShareLink(operation.material)
  operation.material = undefined
  operation.request = undefined
  operation.recipients = undefined
  operation.choices = undefined
}

function sessionMatches(operation: SharingOperation, organizationId: string): boolean {
  const current = useAuthStore.getState()
  return !operation.controller.signal.aborted && !current.isVaultLocked
    && current.privateKey !== null && current.privateKey === operation.auth.privateKey
    && current.userId === operation.auth.userId
    && current.cryptoSessionGeneration === operation.auth.cryptoSessionGeneration
    && (current.permissions & PERMISSION_VAULT_MANAGE) !== 0
    && organizationIdFromAccessToken(current.accessToken) === organizationId
}

export function useShareCreation(scope: ShareSourceScope, onCreated: () => void) {
  const [source, setSource] = useState<MemberSecretV1 | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [retryPending, setRetryPending] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [links, setLinks] = useState<CreatedShareLink[]>([])
  const [loadAttempt, setLoadAttempt] = useState(0)
  const operationRef = useRef<SharingOperation | null>(null)
  const onCreatedRef = useRef(onCreated)
  useEffect(() => { onCreatedRef.current = onCreated }, [onCreated])

  const { organizationId, vaultId, entryId, revision, keyVersion } = scope
  useEffect(() => {
    const { userId, privateKey, cryptoSessionGeneration } = useAuthStore.getState()
    const operation: SharingOperation = {
      controller: new AbortController(), auth: { userId, privateKey, cryptoSessionGeneration }, submitting: false, nextRecipient: 0,
    }
    operationRef.current = operation
    const invalidate = () => {
      dispose(operation)
      setSource(null); setLink(null); setLinks([]); setLoadError(true); setBusy(false); setRetryPending(false)
    }
    const unsubscribe = useAuthStore.subscribe(() => {
      if (!sessionMatches(operation, organizationId)) invalidate()
    })
    window.addEventListener('pagehide', invalidate)
    void (async () => {
      try {
        if (!sessionMatches(operation, organizationId) || !operation.auth.userId || !operation.auth.privateKey) {
          throw new Error('Sharing session unavailable')
        }
        const secret = await openCurrentMemberEntrySecret({
          userId: operation.auth.userId, vaultId, entryId, expectedRevision: revision,
          expectedKeyVersion: keyVersion, memberPrivateKey: operation.auth.privateKey,
        })
        if (sessionMatches(operation, organizationId)) setSource(secret)
      } catch {
        if (!operation.controller.signal.aborted) setLoadError(true)
      }
    })()
    return () => {
      unsubscribe(); window.removeEventListener('pagehide', invalidate); dispose(operation)
      if (operationRef.current === operation) operationRef.current = null
    }
  }, [organizationId, vaultId, entryId, revision, keyVersion, loadAttempt])

  async function submit(form: SharingForm): Promise<'created' | 'failed' | 'cancelled'> {
    const operation = operationRef.current
    if (!operation || operation.submitting || !source || !sessionMatches(operation, organizationId)) return 'cancelled'
    operation.submitting = true
    setBusy(true)
    try {
      if (!operation.recipients) {
        const parsed = sharingFormSchema.safeParse(form)
        if (!parsed.success) throw new Error('Invalid sharing choices')
        operation.choices = parsed.data
        operation.recipients = parsed.data.recipientMode === 'namedRecipient'
          ? sharingRecipients(parsed.data.recipientEmail) ?? undefined : [null]
        if (!operation.recipients) throw new Error('Invalid recipients')
      }
      while (operation.nextRecipient < operation.recipients.length) {
      if (!operation.request) {
        const challenge = await issueShareCreationChallenge(vaultId, entryId, operation.controller.signal)
        if (!sessionMatches(operation, organizationId)) return 'cancelled'
        if (challenge.sourceRevision !== revision) {
          useMemberSyncStore.getState().retry()
          throw new Error('Selected Entry revision changed')
        }
        const choices = operation.choices!
        const expiresAt = new Date(Date.now() + Number(choices.lifetimeHours) * 3_600_000).toISOString()
        const material = await prepareEntryShare({
          organizationId, vaultId, entryId, shareId: challenge.shareId, sourceRevision: revision, expiresAt,
        }, createEntryShareSnapshot(source))
        if (!sessionMatches(operation, organizationId)) {
          clearEntryShareLink(material)
          return 'cancelled'
        }
        operation.material = material
        operation.request = {
          shareId: challenge.shareId, sourceRevision: revision, expiresAt,
          maximumReceipts: choices.maximumReceipts === '' ? null : Number(choices.maximumReceipts), recipientMode: choices.recipientMode,
          recipientEmail: operation.recipients[operation.nextRecipient],
          protection: choices.protection, protectionSecret: choices.protection === 'none' ? null : choices.protectionSecret,
          nonce: material.nonce, ciphertext: material.ciphertext, accessToken: encodeBase64Url(material.accessToken),
          notifyOnFirstReceipt: choices.notifyOnFirstReceipt,
        }
      }
      if (!sessionMatches(operation, organizationId)) return 'cancelled'
      await createEntryShare(vaultId, entryId, operation.request, operation.controller.signal)
      if (!sessionMatches(operation, organizationId)) return 'cancelled'
      const created: CreatedShareLink = {
        recipientEmail: operation.request.recipientEmail,
        link: `${window.location.origin}${entrySharePath(operation.request.shareId)}${entryShareFragment(operation.material!)}`,
      }
      setLinks((current) => [...current, created])
      setLink((current) => current ?? created.link)
      clearEntryShareLink(operation.material!)
      operation.material = undefined; operation.request = undefined
      operation.nextRecipient++
      onCreatedRef.current()
      }
      setSource(null); setRetryPending(false)
      operation.choices = undefined
      operation.recipients = undefined
      return 'created'
    } catch {
      if (!sessionMatches(operation, organizationId)) return 'cancelled'
      setRetryPending(!!operation.recipients)
      return 'failed'
    } finally {
      operation.submitting = false
      if (!operation.controller.signal.aborted) setBusy(false)
    }
  }

  function retryLoad() {
    setLoadError(false); setSource(null); setLoadAttempt((value) => value + 1)
  }

  function retry() {
    const choices = operationRef.current?.choices
    return choices ? submit(choices) : Promise.resolve('cancelled' as const)
  }

  return { source, loadError, busy, retryPending, link, links, submit, retry, retryLoad }
}
