import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSharedUnlockOffer, encodeSharedUnlockIdentityProof, encryptWithKey, fromBase64Url,
  generateKeyPair, hashSharedUnlockKeyContext, hashSharedUnlockTranscript, loadSodium, randomBytes,
  toBase64Url, sealVaultKey, unsealVaultKey, encryptEntry, decryptEntry, ENTRY_TYPE_KEY,
  type SharedUnlockEnvelope,
} from '@palladin/crypto'
import { useAuthStore } from '../stores/auth-store'
import { beginManualUnlockAttempt } from '../session/manual-unlock-attempt'
import { SharedUnlockApi } from './api'
import { beginSharedUnlockReceiver, type SharedUnlockReceiverRoute } from './receiver'
import type { SharedUnlockCommit, SharedUnlockOperation } from './api-types'
import fixtures from './fixtures/session-api-v1.json'

vi.mock('../../../shared/lib/env', () => ({ env: { apiUrl: 'https://api.example.test' } }))
const apiUrl = 'https://api.example.test'
const baseline = fixtures.responses.find(r => r.type === 'operation' && r.body.context?.direction === 'extension-to-web')!.body as SharedUnlockOperation
const now = baseline.context.issuedAtMs
const oldSession = { accessToken: 'old-own-access', refreshToken: 'old-own-refresh', userId: baseline.context.accountId, isOnboarded: true }
const newSession = { ...oldSession, accessToken: 'receiver-own-access', refreshToken: 'receiver-own-refresh', emailVerified: false,
  waitlistDeveloperBenefitStartedAt: null, waitlistDeveloperBenefitEndsAt: null }
const cancels: (() => void)[] = []
beforeAll(async () => { await loadSodium() })
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now)
  useAuthStore.getState().logout()
  useAuthStore.getState().setTokens(oldSession)
})
afterEach(() => { for (const cancel of cancels.splice(0)) cancel(); useAuthStore.getState().logout(); vi.restoreAllMocks() })
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }

async function setup(options: { pause?: 'consume' | 'commit'; transformConsume?: (op: SharedUnlockOperation) => SharedUnlockOperation;
  transformCommit?: (commit: SharedUnlockCommit) => SharedUnlockCommit } = {}) {
  let current = true
  const original = baseline.context
  const route: SharedUnlockReceiverRoute = {
    apiUrl, binding: {
      accountId: original.accountId, organizationId: original.organizationId, apiOrigin: apiUrl,
      webOrigin: original.webOrigin, extensionId: original.extensionId, documentBinding: original.documentBinding,
      webGeneration: original.webGeneration, extensionGeneration: original.extensionGeneration,
      linkId: original.linkId, linkEpoch: original.linkEpoch, preferenceRevision: original.preferenceRevision,
    }, assertCurrent: () => { if (!current) throw new Error('route changed') },
  }
  const pendingResponse = deferred<Response>()
  const events: string[] = []
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const action = String(url).split('/').at(-1)!
    events.push(action)
    expect(init).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store' })
    expect(new Headers(init?.headers).has('authorization')).toBe(false)
    if (action === 'logout') {
      expect(JSON.parse(String(init?.body))).toEqual({ refreshToken: newSession.refreshToken })
      return new Response(null, { status: 204 })
    }
    const purpose = action as 'consume' | 'commit'
    const proof = { operationId: operation.context.operationId, challenge: operation.challenge,
      transcriptHash: operation.transcriptHash, issuedAtMs: operation.context.issuedAtMs, expiresAtMs: operation.context.expiresAtMs }
    const sodium = await loadSodium()
    expect(sodium.crypto_sign_verify_detached(fromBase64Url(JSON.parse(String(init?.body)).signature),
      encodeSharedUnlockIdentityProof(proof, operation.recipientProofPublicKey, purpose), fromBase64Url(operation.recipientProofPublicKey))).toBe(true)
    if (action === options.pause) return pendingResponse.promise
    return new Response(JSON.stringify(action === 'consume' ? (options.transformConsume?.(operation) ?? operation) : (options.transformCommit?.(ownCommit) ?? ownCommit)))
  })
  const api = new SharedUnlockApi(fetcher, () => apiUrl)
  const receiver = await beginSharedUnlockReceiver(route, api)
  cancels.push(receiver.cancel)
  const masterKey = await randomBytes(32)
  const member = await generateKeyPair()
  const source = await createSharedUnlockOffer({ role: 'source', assertCurrent: () => {} })
  const keyContext = { ...baseline.keyContext, publicKey: toBase64Url(member.publicKey),
    encryptedPrivateKey: toBase64Url(await encryptWithKey(member.privateKey, masterKey)) }
  const context = { ...original, keyContextDigest: await hashSharedUnlockKeyContext(keyContext) }
  const operation: SharedUnlockOperation = { ...baseline, context, keyContext, sourcePublicKey: source.publicKey,
    recipientPublicKey: receiver.publicKey, recipientProofPublicKey: receiver.proofPublicKey,
    transcriptHash: await hashSharedUnlockTranscript(context, source.publicKey, receiver.publicKey) }
  const ownCommit: SharedUnlockCommit = { session: newSession, authorizationId: '88888888-8888-4888-8888-888888888888', authorizationSequence: 5, context }
  const participant = source.bind(context)
  cancels.push(() => { source.dispose(); participant.dispose(); masterKey.fill(0); member.privateKey.fill(0) })
  const ack = vi.fn()
  const envelope = vi.fn(async () => { events.push('envelope'); return participant.seal(masterKey, receiver.publicKey) })
  const input = { operation, verifiedSourcePublicKey: source.publicKey, envelope, acknowledge: ack }
  return { receiver, route, masterKey, member, input, operation, ownCommit, fetcher, ack, envelope, events,
    invalidate: () => { current = false }, pendingResponse }
}

describe('Web own receiver transaction with real crypto', () => {
  it('verifies both proofs, consumes before opening keys and commits its own session before a value-free ACK', async () => {
    const f = await setup()
    const wrappedVaultKey = await sealVaultKey(f.member.privateKey)
    const vaultKey = await unsealVaultKey(wrappedVaultKey, f.member.privateKey)
    const sample = await encryptEntry({ type: ENTRY_TYPE_KEY, value: 'synthetic-test-only' }, vaultKey)
    vaultKey.fill(0)
    const result = await f.receiver.receive(f.input)
    expect(f.events).toEqual(['consume', 'envelope', 'commit'])
    expect(f.ack).toHaveBeenCalledExactlyOnceWith(result)
    expect(Object.keys(result).sort()).toEqual(['authorizationId', 'authorizationSequence', 'cryptoSessionGeneration', 'operationId'])
    const installed = useAuthStore.getState()
    expect(installed).toMatchObject({ ...newSession, isVaultLocked: false, unlockLimits: {
      unlockedAtMs: f.operation.context.unlockedAtMs, idleDeadlineMs: f.operation.context.idleDeadlineMs,
      absoluteDeadlineMs: f.operation.context.absoluteDeadlineMs, offlineDeadlineMs: f.operation.context.absoluteDeadlineMs,
    } })
    expect(installed.masterKey).toEqual(f.masterKey)
    expect(installed.privateKey).toEqual(f.member.privateKey)
    const recoveredVaultKey = await unsealVaultKey(wrappedVaultKey, installed.privateKey!)
    expect(await decryptEntry(sample, recoveredVaultKey)).toEqual({ type: ENTRY_TYPE_KEY, value: 'synthetic-test-only' })
    recoveredVaultKey.fill(0)
    f.receiver.cancel() // peer loss after successful completion is not a lock/logout.
    expect(useAuthStore.getState()).toBe(installed)
    expect(f.events).not.toContain('logout')
    await expect(f.receiver.receive(f.input)).rejects.toMatchObject({ code: 'conflict' })
    expect(installed.masterKey).toEqual(f.masterKey)
  })

  it('installs a signed-out receiver without copying a source bearer', async () => {
    useAuthStore.getState().logout()
    const f = await setup()
    await f.receiver.receive(f.input)
    expect(useAuthStore.getState()).toMatchObject({ ...newSession, isVaultLocked: false })
  })

  for (const key of ['accountId', 'organizationId', 'apiOrigin', 'webOrigin', 'extensionId', 'documentBinding',
    'webGeneration', 'extensionGeneration', 'linkId', 'linkEpoch', 'preferenceRevision'] as const) {
    it(`rejects offered ${key} differing from independently captured route authority before sending a proof`, async () => {
      const f = await setup()
      const context = { ...f.operation.context, [key]: typeof f.operation.context[key] === 'number' ? 999 : 'other' }
      await expect(f.receiver.receive({ ...f.input, operation: { ...f.operation, context } })).rejects.toThrow()
      expect(f.fetcher).not.toHaveBeenCalled()
      expect(useAuthStore.getState().masterKey).toBeNull()
    })
  }

  for (const change of ['lock', 'logout', 'expire', 'manual', 'route', 'cancel'] as const) {
    for (const pause of ['consume', 'commit'] as const) {
      it(`rejects late ${pause} after ${change} and revokes only a newly issued own session`, async () => {
        const f = await setup({ pause })
        const receive = f.receiver.receive(f.input)
        const rejection = expect(receive).rejects.toThrow()
        await vi.waitFor(() => expect(f.events).toContain(pause))
        if (change === 'lock') useAuthStore.getState().lockVault()
        if (change === 'logout') useAuthStore.getState().logout()
        if (change === 'expire') useAuthStore.getState().expireSession()
        if (change === 'manual') beginManualUnlockAttempt()
        if (change === 'route') f.invalidate()
        if (change === 'cancel') f.receiver.cancel()
        f.pendingResponse.resolve(new Response(JSON.stringify(pause === 'consume' ? f.operation : f.ownCommit)))
        await rejection
        if (pause === 'commit') await vi.waitFor(() => expect(f.events.filter(e => e === 'logout')).toHaveLength(1))
        else expect(f.events).not.toContain('logout')
        expect(f.ack).not.toHaveBeenCalled()
        expect(useAuthStore.getState()).toMatchObject({ isVaultLocked: true, masterKey: null, privateKey: null })
        expect(useAuthStore.getState().refreshToken).toBe(change === 'logout' ? null : oldSession.refreshToken)
      })
    }
  }

  for (const field of ['sourcePublicKey', 'recipientPublicKey', 'recipientProofPublicKey'] as const) {
    it(`rejects ${field} not matching the independently authenticated/locally generated participant`, async () => {
      const f = await setup()
      await expect(f.receiver.receive({ ...f.input, operation: { ...f.operation, [field]: toBase64Url(new Uint8Array(32)) } })).rejects.toThrow('participant binding')
      expect(f.fetcher).not.toHaveBeenCalled()
    })
  }

  it('cancels a stalled envelope without waiting for the transport to resolve', async () => {
    const f = await setup()
    const envelope = vi.fn(() => new Promise<unknown>(() => {}))
    const pending = f.receiver.receive({ ...f.input, envelope })
    const rejected = expect(pending).rejects.toThrow()
    await vi.waitFor(() => expect(envelope).toHaveBeenCalledOnce())
    f.receiver.cancel()
    await rejected
    expect(f.events).not.toContain('commit')
    expect(useAuthStore.getState()).toMatchObject({ ...oldSession, masterKey: null, privateKey: null, isVaultLocked: true })
  })

  it('disposes an unused receiver after thirty seconds without sending a proof', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const f = await setup()
      await vi.advanceTimersByTimeAsync(30000)
      await expect(f.receiver.receive(f.input)).rejects.toMatchObject({ code: 'cancelled' })
      expect(f.fetcher).not.toHaveBeenCalled()
      expect(useAuthStore.getState()).toMatchObject({ ...oldSession, masterKey: null, privateKey: null, isVaultLocked: true })
    } finally { vi.useRealTimers() }
  })

  it('rejects a substituted Identity key descriptor without ever committing tokens', async () => {
    const f = await setup({ transformConsume: op => ({ ...op, keyContext: { ...op.keyContext, publicKey: toBase64Url(new Uint8Array(32)) } }) })
    await expect(f.receiver.receive(f.input)).rejects.toThrow('commitment')
    expect(f.events).not.toContain('commit')
    expect(useAuthStore.getState()).toMatchObject({ ...oldSession, masterKey: null })
  })

  it('rejects an envelope from another document before token issuance', async () => {
    const f = await setup()
    await expect(f.receiver.receive({ ...f.input, envelope: async () => {
      const sealed = await f.envelope()
      return { ...sealed, context: { ...sealed.context, documentBinding: 'other-document' } } satisfies SharedUnlockEnvelope
    } })).rejects.toThrow()
    expect(f.events).not.toContain('commit')
  })

  it('revokes a minted session whose commit transcript changes', async () => {
    const f = await setup({ transformCommit: commit => ({ ...commit, context: { ...commit.context, linkEpoch: commit.context.linkEpoch + 1 } }) })
    await expect(f.receiver.receive(f.input)).rejects.toThrow('commit binding')
    expect(f.events.filter(e => e === 'logout')).toHaveLength(1)
    expect(useAuthStore.getState()).toMatchObject({ ...oldSession, isVaultLocked: true })
    expect(f.ack).not.toHaveBeenCalled()
  })

  for (const action of ['throw', 'lock', 'expire', 'logout', 'other-account'] as const) {
    it(`cleans only its own installed session if final ACK ${action} prevents completion`, async () => {
      const f = await setup()
      await expect(f.receiver.receive({ ...f.input, acknowledge: () => {
        if (action === 'throw') throw new Error('port closed')
        if (action === 'lock') useAuthStore.getState().lockVault()
        if (action === 'expire') useAuthStore.getState().expireSession()
        if (action === 'logout') useAuthStore.getState().logout()
        if (action === 'other-account') {
          useAuthStore.getState().logout()
          useAuthStore.getState().setTokens({ ...oldSession, userId: 'other-account', refreshToken: 'other-own-refresh' })
        }
      } })).rejects.toThrow()
      expect(f.events.filter(e => e === 'logout')).toHaveLength(1)
      expect(useAuthStore.getState()).toMatchObject({ isVaultLocked: true, masterKey: null, privateKey: null })
      expect(useAuthStore.getState().refreshToken).toBe(action === 'logout' ? null : action === 'other-account' ? 'other-own-refresh' : oldSession.refreshToken)
      if (action === 'expire') expect(useAuthStore.getState().accessToken).toBeNull()
    })
  }
})
