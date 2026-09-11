import type { SharedUnlockContext } from '@palladin/crypto'
import { createSharedUnlockReceiverCrypto } from '../../../shared/crypto/shared-unlock-receiver'
import { wipe } from '../../../shared/crypto/sodium'
import type { SharedUnlockKeys } from '../../../shared/crypto/shared-unlock-keys'
import { env } from '../../../shared/lib/env'
import { sessionDeadline, unlockLimits } from '../lib/session-limits'
import { captureClientSessionGeneration, clientSessionGenerationMatches } from '../session/client-session'
import { captureManualUnlockFence } from '../session/manual-unlock-attempt'
import { useAuthStore } from '../stores/auth-store'
import { SharedUnlockApi, SharedUnlockApiError } from './api'
import type { SharedUnlockAuthorization, SharedUnlockCommit, SharedUnlockOperation } from './api-types'

/** Independently established browser/document + selected account/local-link authority.
 * The browser adapter must invalidate assertCurrent on OFF/revoke/navigation/peer loss.
 * Do not build this object from the operation or encrypted envelope being checked. */
export interface SharedUnlockReceiverRoute {
  readonly apiUrl: string
  readonly binding: Pick<SharedUnlockContext, 'accountId' | 'organizationId' | 'apiOrigin' | 'webOrigin'
    | 'extensionId' | 'documentBinding' | 'webGeneration' | 'extensionGeneration' | 'linkId' | 'linkEpoch' | 'preferenceRevision'>
  assertCurrent(): void
  assertFreshAuthorization?(sequence: number, deadlineMs: number): Promise<void | number>
}

/** Internal completion metadata for inherited authority/UI; not a wire ACK. */
export interface SharedUnlockReceived {
  readonly operationId: string
  readonly authorizationId: string
  readonly authorizationSequence: number
  readonly cryptoSessionGeneration: number
}

/** Protocol session-api.md: ACK identifies only operation and exact generations. */
export interface SharedUnlockAcknowledgement {
  readonly operationId: string
  readonly webGeneration: string
  readonly extensionGeneration: string
}

export type SharedUnlockInstalled = (authorization: SharedUnlockAuthorization, generation: string, assertOwnCurrent: () => void) => void;

export async function beginSharedUnlockReceiver(route: SharedUnlockReceiverRoute,
  api = new SharedUnlockApi((...args) => fetch(...args), () => env.apiUrl), onInstalled?: SharedUnlockInstalled) {
  const apiUrl = route.apiUrl
  const binding = { ...route.binding }
  let previous: ReturnType<typeof useAuthStore.getState> | null = useAuthStore.getState()
  const clientGeneration = captureClientSessionGeneration()
  const manualCurrent = captureManualUnlockFence()
  const abort = new AbortController()
  let closed = false
  let started = false
  let completed = false
  let installedGeneration: number | null = null
  let issued: SharedUnlockCommit | null = null
  let keys: SharedUnlockKeys | null = null
  let cryptoReceiver: Awaited<ReturnType<typeof createSharedUnlockReceiverCrypto>> | null = null
  let cleanup: Promise<void> | null = null
  let releaseListeners = () => {}
  const deadline = Date.now() + 30000
  const reject = () => { throw new SharedUnlockApiError('cancelled') }
  const assertCurrent = () => {
    if (closed || abort.signal.aborted || !clientSessionGenerationMatches(clientGeneration)
      || !manualCurrent() || env.apiUrl !== apiUrl || Date.now() >= deadline) reject()
    const initial = previous
    if (!initial) throw new SharedUnlockApiError('cancelled')
    route.assertCurrent()
    const current = useAuthStore.getState()
    if (installedGeneration === null) {
      if (!current.isVaultLocked || current.masterKey || current.privateKey
        || current.cryptoSessionGeneration !== initial.cryptoSessionGeneration
        || current.userId !== initial.userId || current.accessToken !== initial.accessToken
        || current.refreshToken !== initial.refreshToken
        || (current.userId !== null && current.userId !== binding.accountId)) reject()
    } else if (current.cryptoSessionGeneration !== installedGeneration || current.isVaultLocked
      || current.userId !== binding.accountId || !current.unlockLimits
      || Date.now() >= sessionDeadline(current.unlockLimits)) reject()
    // Reentrant route observers cannot invalidate local generations unnoticed.
    if (closed || abort.signal.aborted || env.apiUrl !== apiUrl || Date.now() >= deadline
      || !clientSessionGenerationMatches(clientGeneration) || !manualCurrent()) reject()
  }
  const assertBinding = (context: SharedUnlockContext) => {
    assertCurrent()
    if (context.direction !== 'extension-to-web' || context.apiOrigin !== new URL(apiUrl).origin) reject()
    for (const key of Object.keys(binding) as (keyof typeof binding)[]) if (context[key] !== binding[key]) reject()
  }
  const revoke = () => {
    if (issued && !completed && !cleanup) cleanup = api.revokeIssuedSession(apiUrl, issued.session.refreshToken)
    return cleanup ?? Promise.resolve()
  }
  const cancel = () => {
    if (completed) return
    closed = true
    previous = null
    releaseListeners()
    abort.abort()
    cryptoReceiver?.dispose()
    if (keys) { wipe(keys.masterKey); wipe(keys.privateKey) }
    void revoke()
  }
  const timeout = setTimeout(cancel, 30000)
  const unsubscribe = useAuthStore.subscribe((current, before) => {
    // The install action advances crypto generation itself; its final guard
    // distinguishes our publication from synchronous lock/logout/new login.
    if (current.isVaultLocked && current.cryptoSessionGeneration !== before.cryptoSessionGeneration) cancel()
  })
  releaseListeners = () => { clearTimeout(timeout); unsubscribe() }
  const wait = <T>(promise: Promise<T>): Promise<T> => new Promise((resolve, rejectWait) => {
    const cancelled = () => rejectWait(new SharedUnlockApiError('cancelled'))
    if (abort.signal.aborted) cancelled()
    else abort.signal.addEventListener('abort', cancelled, { once: true })
    promise.then(resolve, rejectWait).finally(() => abort.signal.removeEventListener('abort', cancelled))
  })
  try {
    assertCurrent()
    cryptoReceiver = await createSharedUnlockReceiverCrypto(assertCurrent)
    assertCurrent()
  } catch (error) { cancel(); clearTimeout(timeout); unsubscribe(); throw error }
  const receiver = cryptoReceiver
  return {
    publicKey: receiver.publicKey,
    proofPublicKey: receiver.proofPublicKey,
    cancel,
    async receive(input: {
      /** Offered on the verified browser channel; Identity consume supplies key authority. */
      operation: SharedUnlockOperation
      verifiedSourcePublicKey: string
      envelope(signal: AbortSignal): Promise<unknown>
      /** Synchronous browser send after the final local/route check; no raw session. */
      acknowledge(result: SharedUnlockAcknowledgement): void
    }): Promise<SharedUnlockReceived> {
      if (started) throw new SharedUnlockApiError('conflict')
      const initial = previous
      if (!initial) throw new SharedUnlockApiError('cancelled')
      started = true
      try {
        assertCurrent()
        const offered = { ...input.operation, context: { ...input.operation.context } }
        assertBinding(offered.context)
        const signature = await receiver.consumeProof(offered, input.verifiedSourcePublicKey)
        assertCurrent()
        const consumed = await wait(api.consume(apiUrl, offered.context.operationId, signature, abort.signal))
        assertBinding(consumed.context)
        await receiver.acceptIdentity(consumed)
        assertCurrent()
        const envelope = await wait(input.envelope(abort.signal))
        assertCurrent()
        keys = await receiver.open(envelope)
        assertCurrent()
        const commit = await wait(api.commit(apiUrl, consumed.context.operationId, receiver.commitProof(), abort.signal, response => {
          issued = response
          if (closed) void revoke().then(() => { if (issued === response) issued = null })
        }))
        assertCurrent()
        await receiver.verifyCommit(commit.context)
        assertBinding(commit.context)
        const effective = unlockLimits(Date.now(), commit.context)
        const persistedDeadline = await wait(route.assertFreshAuthorization?.(commit.authorizationSequence, sessionDeadline(effective)) ?? Promise.resolve())
        const installedLimits = { ...effective, idleDeadlineMs: Math.min(effective.idleDeadlineMs, persistedDeadline ?? Infinity) }
        assertCurrent()
        installedGeneration = useAuthStore.getState().installSharedUnlock({
          expected: initial, accountId: binding.accountId, session: commit.session, keys, limits: installedLimits,
        })
        assertCurrent()
        const result: SharedUnlockReceived = { operationId: commit.context.operationId,
          authorizationId: commit.authorizationId, authorizationSequence: commit.authorizationSequence,
          cryptoSessionGeneration: installedGeneration }
        completed = true
        // Verified own receiver root remains usable independently of the Port.
        const ownInstalled = useAuthStore.getState();
        try {
          onInstalled?.({ authorizationId: commit.authorizationId, sequence: commit.authorizationSequence,
            accountId: binding.accountId, organizationId: binding.organizationId,
            credentialRevision: consumed.keyContext.credentialRevision, privateKeyWrapRevision: consumed.keyContext.privateKeyWrapRevision,
            authorizationVersion: commit.context.authorizationVersion, unlockedAtMs: commit.context.unlockedAtMs,
            idleDeadlineMs: commit.context.idleDeadlineMs, absoluteDeadlineMs: commit.context.absoluteDeadlineMs,
            offlineDeadlineMs: commit.context.offlineDeadlineMs }, binding.webGeneration, () => {
            const current = useAuthStore.getState();
            if (current.cryptoSessionGeneration !== installedGeneration || current.userId !== binding.accountId
              || current.isVaultLocked || current.masterKey !== ownInstalled.masterKey || current.privateKey !== ownInstalled.privateKey
              || !current.unlockLimits || Date.now() >= sessionDeadline(current.unlockLimits)) throw new SharedUnlockApiError('cancelled');
          });
        } catch { /* Failed sharing adoption does not revoke a completed own session. */ }
        // Local installation + final authority check complete the handoff. ACK
        // only stops peer pending UI; losing it cannot revoke a valid session.
        try { input.acknowledge({ operationId: result.operationId,
          webGeneration: binding.webGeneration, extensionGeneration: binding.extensionGeneration }) }
        catch { /* no retry/deferred ACK queue; independently valid session survives peer close */ }
        return result
      } finally {
        if (keys) { wipe(keys.masterKey); wipe(keys.privateKey); keys = null }
        receiver.dispose()
        clearTimeout(timeout)
        unsubscribe()
        if (!completed) {
          cancel()
          const ownIssued = issued as SharedUnlockCommit | null
          if (installedGeneration !== null && ownIssued) {
            // Compare only our newly published lineage. Never undo another login,
            // logout or manual key generation. The old snapshot was locked.
            try {
              useAuthStore.setState(current => {
                if (!clientSessionGenerationMatches(clientGeneration)
                  || (current.cryptoSessionGeneration !== installedGeneration && !current.isVaultLocked)
                  || current.refreshToken !== ownIssued.session.refreshToken
                  || current.userId !== binding.accountId) return current
                if (current.masterKey) wipe(current.masterKey)
                if (current.privateKey) wipe(current.privateKey)
                return { ...initial, accessToken: current.accessToken === null ? null : initial.accessToken,
                  cryptoSessionGeneration: current.cryptoSessionGeneration + 1,
                  masterKey: null, privateKey: null, unlockLimits: null, isVaultLocked: true }
              })
            } catch { /* state/key cleanup precedes synchronous observers or persistence */ }
          }
          await revoke()
        }
        // A completed/cancelled receiver must not retain old or issued bearer
        // tokens after it leaves the active operation, even if its handle lives.
        previous = null
        issued = null
      }
    },
  }
}
