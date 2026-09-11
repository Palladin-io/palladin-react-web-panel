import { SharedUnlockReconnectStaging } from './reconnect-staging'
import { SharedUnlockLinkStore } from './link-store'
import type { SharedUnlockCoordinatorRoute } from './browser-coordinator'
import { SharedUnlockExpiryStore } from './expiry-store';
import type { SharedUnlockInstalled } from "./receiver";
import { receiveSharedUnlockBrowserTransfer, type SharedUnlockOperationTransport } from "./browser-transfer";
import { sharedUnlockOperationSchema, type SharedUnlockOperationMessage } from "./browser-operation-message";
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
import { notifySharedUnlockCompleted } from './completion-toast'

vi.mock('./completion-toast', () => ({ notifySharedUnlockCompleted: vi.fn() }))

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
  vi.mocked(notifySharedUnlockCompleted).mockClear()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  useAuthStore.getState().logout()
  useAuthStore.getState().setTokens(oldSession)
})
afterEach(() => { for (const cancel of cancels.splice(0)) cancel(); useAuthStore.getState().logout(); vi.restoreAllMocks() })
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }

async function setup(options: { confirmLocalLink?: SharedUnlockReceiverRoute["confirmLocalLink"]; assertFreshAuthorization?: SharedUnlockReceiverRoute["assertFreshAuthorization"]; onInstalled?: SharedUnlockInstalled; pause?: 'consume' | 'commit'; transformConsume?: (op: SharedUnlockOperation) => SharedUnlockOperation;
  transformCommit?: (commit: SharedUnlockCommit) => SharedUnlockCommit; afterInstall?: () => void } = {}) {
  let current = true
  let checkedInstall = false
  const original = baseline.context
  const route: SharedUnlockReceiverRoute = {
    ...(options.confirmLocalLink ? { confirmLocalLink: options.confirmLocalLink } : {}),
    assertFreshAuthorization: options.assertFreshAuthorization,
    apiUrl, binding: {
      accountId: original.accountId, organizationId: original.organizationId, apiOrigin: apiUrl,
      webOrigin: original.webOrigin, extensionId: original.extensionId, documentBinding: original.documentBinding,
      webGeneration: original.webGeneration, extensionGeneration: original.extensionGeneration,
      linkId: original.linkId, linkEpoch: original.linkEpoch, preferenceRevision: original.preferenceRevision,
    }, assertCurrent: () => {
      if (!current) throw new Error('route changed')
      if (!checkedInstall && !useAuthStore.getState().isVaultLocked) {
        checkedInstall = true
        options.afterInstall?.()
      }
    },
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
  const receiver = await beginSharedUnlockReceiver(route, api, options.onInstalled)
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
  it('announces a completed automatic login/unlock once, independently of lost ACK', async () => {
    useAuthStore.getState().logout()
    const f = await setup({ pause: 'commit' })
    const input = { ...f.input, acknowledge: () => { throw new Error('peer closed') } }
    const pending = f.receiver.receive(input)
    await vi.waitFor(() => expect(f.events).toContain('commit'))
    expect(notifySharedUnlockCompleted).not.toHaveBeenCalled()
    f.pendingResponse.resolve(new Response(JSON.stringify(f.ownCommit)))
    await pending
    expect(useAuthStore.getState().isVaultLocked).toBe(false)
    expect(notifySharedUnlockCompleted).toHaveBeenCalledExactlyOnceWith()
    f.receiver.cancel()
    await expect(f.receiver.receive(input)).rejects.toMatchObject({ code: 'conflict' })
    expect(notifySharedUnlockCompleted).toHaveBeenCalledOnce()
  })

  it('does not announce when the final own-link check rejects installation', async () => {
    const f = await setup({ confirmLocalLink: async () => { throw new Error('locked remotely') } })
    await expect(f.receiver.receive(f.input)).rejects.toThrow('locked remotely')
    expect(notifySharedUnlockCompleted).not.toHaveBeenCalled()
  })

  it('does not announce an installation superseded by a local lock during adoption', async () => {
    const f = await setup({ onInstalled: () => useAuthStore.getState().lockVault() })
    await f.receiver.receive(f.input)
    expect(useAuthStore.getState().isVaultLocked).toBe(true)
    expect(notifySharedUnlockCompleted).not.toHaveBeenCalled()
  })

  it('does not announce manual unlock or token refresh without a receiver completion', () => {
    useAuthStore.getState().unlockVault(new Uint8Array(32).fill(1), new Uint8Array(32).fill(2))
    useAuthStore.getState().setTokens(newSession)
    expect(notifySharedUnlockCompleted).not.toHaveBeenCalled()
  })

  it("publishes verified inherited authority independently of subsequent peer loss", async () => {
    const adopted = vi.fn<SharedUnlockInstalled>();
    const f = await setup({ onInstalled: adopted });
    await f.receiver.receive(f.input);
    expect(adopted).toHaveBeenCalledOnce();
    const [root, generation, ownCurrent] = adopted.mock.calls[0];
    expect(root).toMatchObject({ authorizationId: f.ownCommit.authorizationId, sequence: f.ownCommit.authorizationSequence,
      accountId: f.operation.context.accountId, organizationId: f.operation.context.organizationId,
      credentialRevision: f.operation.keyContext.credentialRevision, privateKeyWrapRevision: f.operation.keyContext.privateKeyWrapRevision,
      unlockedAtMs: f.operation.context.unlockedAtMs, absoluteDeadlineMs: f.operation.context.absoluteDeadlineMs,
      offlineDeadlineMs: f.operation.context.offlineDeadlineMs });
    expect(generation).toBe(f.route.binding.webGeneration);
    f.invalidate();
    expect(() => ownCurrent()).not.toThrow();
    useAuthStore.getState().lockVault();
    expect(() => ownCurrent()).toThrow();
  });

  it("installs the real receiver transaction from operation frames before sending its ACK", async () => {
    const f = await setup(); const envelope = await f.input.envelope();
    let receive!: (message: SharedUnlockOperationMessage) => void;
    const messages: SharedUnlockOperationMessage[] = [];
    let masterKeyAtAck: Uint8Array | null | undefined = null;
    const transport: SharedUnlockOperationTransport = {
      signal: new AbortController().signal, assertCurrent: f.route.assertCurrent, verifyCurrent: async () => f.route.assertCurrent(),
      onOperation: listener => { receive = listener; return () => {}; },
      sendOperation: raw => {
        const message = sharedUnlockOperationSchema.parse(raw); messages.push(message);
        if (message.payload.kind === "receiver-offer") receive(sharedUnlockOperationSchema.parse({ attemptId: message.attemptId,
          payload: { kind: "handoff", operation: f.operation, envelope } }));
        if (message.payload.kind === "ack") {
          masterKeyAtAck = useAuthStore.getState().masterKey;
        }
      },
    };
    const result = receiveSharedUnlockBrowserTransfer(transport, "A".repeat(43), async () => f.receiver);
    receive({ attemptId: "A".repeat(43), payload: { kind: "source-offer", publicKey: f.operation.sourcePublicKey } });
    expect((await result).operationId).toBe(f.operation.context.operationId);
    expect(masterKeyAtAck).toEqual(f.masterKey);
    expect(messages.map(m => m.payload.kind)).toEqual(["receiver-offer", "ack"]);
    expect(messages[1].payload).toEqual({ kind: "ack", operationId: f.operation.context.operationId,
      webGeneration: f.operation.context.webGeneration, extensionGeneration: f.operation.context.extensionGeneration });
    expect(JSON.stringify(messages)).not.toContain("receiver-own-");
  });

  it('verifies both proofs, consumes before opening keys and commits its own session before a value-free ACK', async () => {
    const f = await setup()
    const wrappedVaultKey = await sealVaultKey(f.member.privateKey)
    const vaultKey = await unsealVaultKey(wrappedVaultKey, f.member.privateKey)
    const sample = await encryptEntry({ type: ENTRY_TYPE_KEY, value: 'synthetic-test-only' }, vaultKey)
    vaultKey.fill(0)
    const result = await f.receiver.receive(f.input)
    expect(f.events).toEqual(['consume', 'envelope', 'commit'])
    expect(f.ack).toHaveBeenCalledExactlyOnceWith({ operationId: result.operationId,
      webGeneration: f.operation.context.webGeneration, extensionGeneration: f.operation.context.extensionGeneration })
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
        expect(notifySharedUnlockCompleted).not.toHaveBeenCalled()
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

  it('keeps a completed session when the ACK is lost, without retry or cleanup logout', async () => {
    const f = await setup()
    const acknowledge = vi.fn(() => { throw new Error('port closed') })
    const result = await f.receiver.receive({ ...f.input, acknowledge })
    expect(acknowledge).toHaveBeenCalledExactlyOnceWith({ operationId: result.operationId,
      webGeneration: f.operation.context.webGeneration, extensionGeneration: f.operation.context.extensionGeneration })
    expect(useAuthStore.getState()).toMatchObject({ ...newSession, isVaultLocked: false })
    f.receiver.cancel()
    expect(useAuthStore.getState().masterKey).toEqual(f.masterKey)
    expect(f.events).not.toContain('logout')
    await expect(f.receiver.receive(f.input)).rejects.toMatchObject({ code: 'conflict' })
    expect(acknowledge).toHaveBeenCalledOnce()
  })

  for (const action of ['throw', 'lock', 'expire', 'logout', 'other-account'] as const) {
    it(`cleans only its own installed session if final route check ${action} prevents completion`, async () => {
      const f = await setup({ afterInstall: () => {
        if (action === 'throw') throw new Error('route changed after installation')
        if (action === 'lock') useAuthStore.getState().lockVault()
        if (action === 'expire') useAuthStore.getState().expireSession()
        if (action === 'logout') useAuthStore.getState().logout()
        if (action === 'other-account') {
          useAuthStore.getState().logout()
          useAuthStore.getState().setTokens({ ...oldSession, userId: 'other-account', refreshToken: 'other-own-refresh' })
        }
      } })
      await expect(f.receiver.receive(f.input)).rejects.toThrow()
      expect(f.ack).not.toHaveBeenCalled()
      expect(f.events.filter(e => e === 'logout')).toHaveLength(1)
      expect(useAuthStore.getState()).toMatchObject({ isVaultLocked: true, masterKey: null, privateKey: null })
      expect(useAuthStore.getState().refreshToken).toBe(action === 'logout' ? null : action === 'other-account' ? 'other-own-refresh' : oldSession.refreshToken)
      if (action === 'expire') expect(useAuthStore.getState().accessToken).toBeNull()
    })
  }
})

it.each([5, 6])('checks own Identity sequence before installing keys (retired through %s)', async retired => {
  const values: Record<string, unknown> = {};
  const storage = { get: async () => values, set: async (items: Record<string, unknown>) => { Object.assign(values, items); } };
  const scope = { apiUrl, accountId: baseline.context.accountId };
  await new SharedUnlockExpiryStore(storage, action => action()).advance(scope, retired);
  const restarted = new SharedUnlockExpiryStore(storage, action => action());
  const f = await setup({ assertFreshAuthorization: sequence => restarted.assertFresh(scope, sequence) });
  await expect(f.receiver.receive(f.input)).rejects.toThrow('retired locally');
  expect(useAuthStore.getState().masterKey).toBeNull(); expect(useAuthStore.getState().isVaultLocked).toBe(true);
  expect(f.events).toEqual(['consume', 'envelope', 'commit', 'logout']);
  expect(f.ack).not.toHaveBeenCalled();
});
it('accepts a fresh manual authorization above the persisted local barrier', async () => {
  const values: Record<string, unknown> = {};
  const store = new SharedUnlockExpiryStore({ get: async () => values, set: async items => { Object.assign(values, items); } }, action => action());
  const scope = { apiUrl, accountId: baseline.context.accountId };
  await store.advance(scope, 4);
  const f = await setup({ assertFreshAuthorization: sequence => store.assertFresh(scope, sequence) });
  await f.receiver.receive(f.input);
  expect(f.events).toEqual(['consume', 'envelope', 'commit']);
  expect(f.ack).toHaveBeenCalledOnce();
});

it('rejects a previously checkpointed authorization that expired while this client was closed', async () => {
  const values: Record<string, unknown> = {};
  const storage = { get: async () => values, set: async (items: Record<string, unknown>) => { Object.assign(values, items); } };
  const scope = { apiUrl, accountId: baseline.context.accountId };
  await new SharedUnlockExpiryStore(storage, action => action(), () => now - 100).checkpoint(scope, 5, now - 1);
  const restarted = new SharedUnlockExpiryStore(storage, action => action(), () => now);
  const f = await setup({ assertFreshAuthorization: (sequence, deadline) => restarted.checkpoint(scope, sequence, deadline) });
  await expect(f.receiver.receive(f.input)).rejects.toThrow('retired locally');
  expect(useAuthStore.getState().masterKey).toBeNull();
  expect(f.events).toEqual(['consume', 'envelope', 'commit', 'logout']);
  expect(f.ack).not.toHaveBeenCalled();
});
it('installs only through the earlier saved deadline when reopened while still valid', async () => {
  const values: Record<string, unknown> = {};
  const storage = { get: async () => values, set: async (items: Record<string, unknown>) => { Object.assign(values, items); } };
  const scope = { apiUrl, accountId: baseline.context.accountId };
  await new SharedUnlockExpiryStore(storage, action => action(), () => now - 100).checkpoint(scope, 5, now + 50);
  const restarted = new SharedUnlockExpiryStore(storage, action => action(), () => now);
  const f = await setup({ assertFreshAuthorization: (sequence, deadline) => restarted.checkpoint(scope, sequence, deadline) });
  await f.receiver.receive(f.input);
  expect(useAuthStore.getState().unlockLimits?.idleDeadlineMs).toBe(now + 50);
  expect(f.ack).toHaveBeenCalledOnce();
  expect(f.events).not.toContain('logout');
});
it('keeps receiver keys unpublished and revokes the new own lineage if the checkpoint cannot be saved', async () => {
  const store = new SharedUnlockExpiryStore({ get: async () => ({}), set: async () => { throw new Error('disk unavailable'); } }, action => action(), () => now);
  const f = await setup({ assertFreshAuthorization: (sequence, deadline) => store.checkpoint({ apiUrl, accountId: baseline.context.accountId }, sequence, deadline) });
  await expect(f.receiver.receive(f.input)).rejects.toThrow('disk unavailable');
  expect(useAuthStore.getState().masterKey).toBeNull();
  expect(f.events).toEqual(['consume', 'envelope', 'commit', 'logout']);
  expect(f.ack).not.toHaveBeenCalled();
});

async function receiverLinkFixture(reconnect = true) {
  const context = baseline.context
  const scope = { apiUrl, webOrigin: context.webOrigin, extensionId: context.extensionId, accountId: context.accountId }
  const values: Record<string, unknown> = {}
  const area = { get: async () => structuredClone(values), set: async (items: Record<string, unknown>) => { Object.assign(values, structuredClone(items)) }, remove: async () => {} }
  const links = new SharedUnlockLinkStore(area, undefined, action => action())
  await links.adopt(scope, context.linkId)
  let marker = await links.observe(scope, { linkId: context.linkId, state: 'revoked', revision: 1,
    epoch: Math.max(0, context.linkEpoch - 1), lastInvalidationSequence: 3, lastLogoutSequence: 0 })
  const active = { linkId: context.linkId, state: 'active' as const, revision: 3, epoch: context.linkEpoch, lastInvalidationSequence: 4, lastLogoutSequence: 0 }
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(active)))
  const abort = new AbortController()
  const route: SharedUnlockCoordinatorRoute = { ...scope, documentBinding: context.documentBinding, signal: abort.signal,
    assertCurrent: () => { if (abort.signal.aborted) throw new Error('closed') }, verifyCurrent: async () => {},
    close: () => abort.abort(), sendOperation: () => {}, onOperation: () => () => {} }
  const staging = new SharedUnlockReconnectStaging(route, () => {})
  if (reconnect) staging.observe({ accountId: scope.accountId, linkId: context.linkId, reconnectRevision: 2 })
  else marker = await links.acknowledgeReconnect(scope, context.linkId, marker.disconnectId!, active)
  const captured = staging.capture(marker, context, links, new SharedUnlockApi(fetcher, () => apiUrl))
  cancels.push(() => { staging.close(); abort.abort() })
  return { scope, links, marker, active, fetcher, confirm: captured.confirm }
}
it('a restarted receiver uses its own committed JWT and keeps keys unpublished until fresh link confirmation', async () => {
  useAuthStore.getState().logout()
  const link = await receiverLinkFixture(), response = deferred<Response>()
  link.fetcher.mockImplementationOnce(() => response.promise)
  const f = await setup({ confirmLocalLink: link.confirm }), pending = f.receiver.receive(f.input)
  await vi.waitFor(() => expect(link.fetcher).toHaveBeenCalledOnce())
  expect(useAuthStore.getState().masterKey).toBeNull(); expect(useAuthStore.getState().accessToken).toBeNull()
  expect((await link.links.read(link.scope))?.disconnectId).toBe(link.marker.disconnectId)
  expect(link.fetcher.mock.calls[0][1]).toMatchObject({ headers: { authorization: 'Bearer receiver-own-access' } })
  response.resolve(new Response(JSON.stringify(link.active))); await pending
  expect(useAuthStore.getState().masterKey).toEqual(f.masterKey); expect(useAuthStore.getState().unlockLimits?.unlockedAtMs).toBe(f.ownCommit.context.unlockedAtMs)
  expect((await link.links.read(link.scope))?.disconnectId).toBeNull()
  expect(f.ack).toHaveBeenCalledOnce(); expect(f.events).not.toContain('logout')
})
it('own Identity rejection after commit preserves revocation and revokes only the new receiver session', async () => {
  useAuthStore.getState().logout()
  const link = await receiverLinkFixture(); link.fetcher.mockResolvedValue(new Response('{}', { status: 401 }))
  const f = await setup({ confirmLocalLink: link.confirm })
  await expect(f.receiver.receive(f.input)).rejects.toThrow()
  expect(useAuthStore.getState().masterKey).toBeNull(); expect(useAuthStore.getState().accessToken).toBeNull()
  expect((await link.links.read(link.scope))?.disconnectId).toBe(link.marker.disconnectId)
  expect(f.events).toContain('commit'); expect(f.events).toContain('logout'); expect(f.ack).not.toHaveBeenCalled()
})
it('a new own lock during rootless confirmation wins over a late authenticated success', async () => {
  useAuthStore.getState().logout()
  const link = await receiverLinkFixture(), response = deferred<Response>(); link.fetcher.mockImplementationOnce(() => response.promise)
  const f = await setup({ confirmLocalLink: link.confirm }), pending = f.receiver.receive(f.input)
  const rejected = expect(pending).rejects.toThrow()
  await vi.waitFor(() => expect(link.fetcher).toHaveBeenCalled())
  useAuthStore.getState().lockVault()
  response.resolve(new Response(JSON.stringify(link.active))); await rejected
  expect(useAuthStore.getState().masterKey).toBeNull(); expect(useAuthStore.getState().accessToken).toBeNull()
  expect((await link.links.read(link.scope))?.disconnectId).toBe(link.marker.disconnectId)
  expect(f.ack).not.toHaveBeenCalled(); expect(f.events).toContain('logout')
})


it('a normal receiver without an old JWT or reconnect hint waits for own current link authority before publishing keys', async () => {
  useAuthStore.getState().logout()
  const link = await receiverLinkFixture(false), response = deferred<Response>()
  link.fetcher.mockImplementationOnce(() => response.promise)
  const f = await setup({ confirmLocalLink: link.confirm }), pending = f.receiver.receive(f.input)
  await vi.waitFor(() => expect(link.fetcher).toHaveBeenCalledOnce())
  expect(useAuthStore.getState().masterKey).toBeNull(); expect(useAuthStore.getState().accessToken).toBeNull()
  expect(link.marker.disconnectId).toBeNull(); expect(f.events).toContain('commit')
  expect(link.fetcher.mock.calls[0][1]).toMatchObject({ headers: { authorization: 'Bearer receiver-own-access' } })
  response.resolve(new Response(JSON.stringify(link.active))); await pending
  expect(useAuthStore.getState().masterKey).toEqual(f.masterKey)
  expect(f.ack).toHaveBeenCalledOnce(); expect(f.events).not.toContain('logout')
})
it('a server lock after normal receiver commit prevents key installation even before local invalidation delivery', async () => {
  useAuthStore.getState().logout()
  const link = await receiverLinkFixture(false), response = deferred<Response>()
  link.fetcher.mockImplementationOnce(() => response.promise)
  const f = await setup({ confirmLocalLink: link.confirm }), pending = f.receiver.receive(f.input)
  const rejected = expect(pending).rejects.toThrow()
  await vi.waitFor(() => expect(link.fetcher).toHaveBeenCalledOnce())
  expect(f.events).toContain('commit'); expect((await link.links.read(link.scope))?.observed).toEqual(link.active)
  response.resolve(new Response(JSON.stringify({ ...link.active, state: 'locked', epoch: link.active.epoch + 1,
    lastInvalidationSequence: f.ownCommit.authorizationSequence + 1 }))); await rejected
  expect(useAuthStore.getState().masterKey).toBeNull(); expect(useAuthStore.getState().accessToken).toBeNull()
  expect(f.ack).not.toHaveBeenCalled(); expect(f.events).toContain('logout')
})
