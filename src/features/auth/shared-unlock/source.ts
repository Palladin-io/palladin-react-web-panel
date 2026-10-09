import type { SharedUnlockEnvelope } from '@palladin/crypto'
import { createSharedUnlockSourceCrypto } from '../../../shared/crypto/shared-unlock-source'
import { env } from '../../../shared/lib/env'
import { sessionDeadline } from '../lib/session-limits'
import { captureClientSessionGeneration, clientSessionGenerationMatches } from '../session/client-session'
import { captureManualUnlockFence } from '../session/manual-unlock-attempt'
import { useAuthStore } from '../stores/auth-store'
import { SharedUnlockApi, SharedUnlockApiError } from './api'
import type { SharedUnlockOperation } from './api-types'
import { getSharedUnlockSourceSnapshot } from './manual-source'
import { sharedUnlockOperationMessage } from './operation-message'
import type { SharedUnlockReceiverRoute } from './receiver'

/** The selected account/link/preference authority is independent of the operation response.
 * The route owner aborts on navigation, peer loss, OFF, closing intent or revocation. */
export interface SharedUnlockSourceRoute extends Pick<SharedUnlockReceiverRoute, 'apiUrl' | 'binding' | 'assertCurrent'> {
  readonly signal: AbortSignal
}

export async function beginSharedUnlockSource(route: SharedUnlockSourceRoute,
  api = new SharedUnlockApi((...args) => fetch(...args), () => env.apiUrl)) {
  const binding = { ...route.binding }
  const apiUrl = route.apiUrl
  let initial: ReturnType<typeof useAuthStore.getState> | null = useAuthStore.getState()
  const clientGeneration = captureClientSessionGeneration()
  const manualCurrent = captureManualUnlockFence()
  const authority = getSharedUnlockSourceSnapshot()
  const root = authority.authorization
  const abort = new AbortController()
  let crypto: Awaited<ReturnType<typeof createSharedUnlockSourceCrypto>> | null = null
  let started = false
  let release = () => {}
  const deadline = Date.now() + 30000
  const cancel = () => {
    if (abort.signal.aborted) return
    initial = null
    release()
    abort.abort()
    crypto?.dispose()
  }
  const reject = () => { throw new SharedUnlockApiError('cancelled') }
  const assertCurrent = () => {
    if (abort.signal.aborted || route.signal.aborted || !initial || !root
      || !clientSessionGenerationMatches(clientGeneration) || !manualCurrent()
      || env.apiUrl !== apiUrl || Date.now() >= deadline) reject()
    route.assertCurrent()
    const own = useAuthStore.getState()
    const current = getSharedUnlockSourceSnapshot()
    if (!initial || !root || own.isVaultLocked || !own.masterKey || !own.privateKey || !own.accessToken || !own.sessionId
      || own.userId !== binding.accountId || root.accountId !== binding.accountId || root.organizationId !== binding.organizationId
      || own.cryptoSessionGeneration !== initial.cryptoSessionGeneration || own.masterKey !== initial.masterKey || own.privateKey !== initial.privateKey
      || own.accessToken !== initial.accessToken || own.sessionId !== initial.sessionId
      || !own.unlockLimits || Date.now() >= sessionDeadline(own.unlockLimits)
      || current.authorization?.authorizationId !== root.authorizationId || current.authorization.sequence !== root.sequence
      || current.authorization.accountId !== root.accountId || current.authorization.organizationId !== root.organizationId
      || current.authorization.authorizationVersion !== root.authorizationVersion
      || current.authorization.credentialRevision !== root.credentialRevision
      || current.authorization.privateKeyWrapRevision !== root.privateKeyWrapRevision
      || current.sourceGeneration !== binding.webGeneration || authority.sourceGeneration !== binding.webGeneration
      || current.preference?.sharedUnlockEnabled !== true || current.preference.revision !== binding.preferenceRevision
      || Date.now() >= Math.min(root.idleDeadlineMs, root.absoluteDeadlineMs, root.offlineDeadlineMs)) reject()
    if (abort.signal.aborted || route.signal.aborted || !clientSessionGenerationMatches(clientGeneration) || !manualCurrent()) reject()
  }
  const timeout = setTimeout(cancel, 30000)
  const unsubscribe = useAuthStore.subscribe((current, previous) => {
    if (current.cryptoSessionGeneration !== previous.cryptoSessionGeneration || current.userId !== previous.userId
      || current.accessToken !== previous.accessToken || current.sessionId !== previous.sessionId) cancel()
  })
  route.signal.addEventListener('abort', cancel, { once: true })
  release = () => { clearTimeout(timeout); unsubscribe(); route.signal.removeEventListener('abort', cancel) }
  const wait = <T>(promise: Promise<T>): Promise<T> => new Promise((resolve, rejectWait) => {
    const cancelled = () => rejectWait(new SharedUnlockApiError('cancelled'))
    if (abort.signal.aborted) cancelled()
    else abort.signal.addEventListener('abort', cancelled, { once: true })
    promise.then(resolve, rejectWait).finally(() => abort.signal.removeEventListener('abort', cancelled))
  })
  try { assertCurrent(); crypto = await createSharedUnlockSourceCrypto(assertCurrent, { allowHttpOrigins: [new URL(apiUrl).origin, binding.webOrigin] }); assertCurrent() }
  catch (error) { cancel(); throw error }
  const source = crypto
  return {
    publicKey: source.publicKey,
    cancel,
    /** The transaction retains own authority until a fresh browser check and synchronous send. */
    async send(input: { readonly recipientPublicKey: string; readonly recipientProofPublicKey: string
      verifyRecipient(): Promise<void>
      send(packet: { operation: SharedUnlockOperation; envelope: SharedUnlockEnvelope }): void
    }) {
      if (started) throw new SharedUnlockApiError('conflict')
      started = true
      const recipient = { publicKey: input.recipientPublicKey, proofPublicKey: input.recipientProofPublicKey }
      const verifyRecipient = input.verifyRecipient
      const send = input.send
      try {
        assertCurrent()
        const own = initial
        if (!own?.masterKey || !own.privateKey || !own.accessToken || !own.sessionId || !own.userId || !own.unlockLimits || !root) reject()
        // Capture effective local limits at creation, never reconstruct a longer inherited ceiling.
        const currentLimits = useAuthStore.getState().unlockLimits!
        const operation: SharedUnlockOperation = sharedUnlockOperationMessage(await wait(api.createOperation({ apiUrl,
          accessToken: own!.accessToken!, sessionId: own!.sessionId!, userId: own!.userId! }, {
          authorizationId: root!.authorizationId, linkId: binding.linkId, linkEpoch: binding.linkEpoch,
          expectedPreferenceRevision: binding.preferenceRevision, recipientOrganizationId: binding.organizationId,
          idleDeadlineMs: currentLimits.idleDeadlineMs, absoluteDeadlineMs: currentLimits.absoluteDeadlineMs,
          offlineDeadlineMs: currentLimits.offlineDeadlineMs, direction: 'web-to-extension', apiOrigin: binding.apiOrigin,
          webOrigin: binding.webOrigin, extensionId: binding.extensionId, documentBinding: binding.documentBinding,
          webGeneration: binding.webGeneration, extensionGeneration: binding.extensionGeneration,
          sourcePublicKey: source.publicKey, recipientPublicKey: recipient.publicKey, recipientProofPublicKey: recipient.proofPublicKey,
        }, abort.signal)))
        assertCurrent()
        // Scope comparisons are cryptographic request authority, not duplicated REST domain rules.
        const context = operation.context
        if (context.direction !== 'web-to-extension' || context.apiOrigin !== new URL(apiUrl).origin
          || context.authorizationVersion !== root!.authorizationVersion) reject()
        for (const key of Object.keys(binding) as (keyof typeof binding)[]) if (context[key] !== binding[key]) reject()
        const envelope = await source.seal(operation, recipient, own!.masterKey!, own!.privateKey!)
        assertCurrent()
        await wait(verifyRecipient())
        assertCurrent()
        send({ operation, envelope })
        return { operationId: context.operationId, webGeneration: binding.webGeneration,
          extensionGeneration: binding.extensionGeneration }
      } finally { cancel() }
    },
  }
}
