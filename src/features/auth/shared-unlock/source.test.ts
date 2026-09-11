import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSharedUnlockOffer, createSharedUnlockIdentityProofSigner, randomBytes, generateKeyPair, encryptWithKey,
  hashSharedUnlockKeyContext, hashSharedUnlockTranscript, loadSodium, toBase64Url, sealVaultKey, unsealVaultKey,
  encryptEntry, decryptEntry, ENTRY_TYPE_KEY } from '@palladin/crypto'
import { useAuthStore } from '../stores/auth-store'
import { beginManualUnlockAttempt } from '../session/manual-unlock-attempt'
import { SharedUnlockApi } from './api'
import { beginSharedUnlockSource, type SharedUnlockSourceRoute } from './source'
import { recoverSharedUnlockKeys } from '../../../shared/crypto/shared-unlock-keys'
import type { SharedUnlockAuthorization, SharedUnlockOperation, SharedUnlockOperationInput, SharedUnlockPreference } from './api-types'
import fixtures from './fixtures/session-api-v1.json'

const holder = vi.hoisted(() => ({ snapshot: { authorization: null as SharedUnlockAuthorization | null,
  preference: null as SharedUnlockPreference | null, sourceGeneration: null as string | null } }))
vi.mock('./manual-source', () => ({ getSharedUnlockSourceSnapshot: () => ({ ...holder.snapshot,
  authorization: holder.snapshot.authorization ? { ...holder.snapshot.authorization } : null,
  preference: holder.snapshot.preference ? { ...holder.snapshot.preference } : null }) }))
vi.mock('../../../shared/lib/env', () => ({ env: { apiUrl: 'https://api.example.test' } }))
const apiUrl = 'https://api.example.test'
const baseline = fixtures.responses.find(r => r.type === 'operation' && r.body.context?.direction === 'web-to-extension')!.body as SharedUnlockOperation
const now = baseline.context.issuedAtMs
const cleanups: (() => void)[] = []
beforeAll(async () => { await loadSodium() })
beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(now); useAuthStore.getState().logout() })
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); useAuthStore.getState().logout(); vi.restoreAllMocks(); vi.useRealTimers() })
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }

async function setup(options: { pause?: boolean; transform?: (operation: SharedUnlockOperation) => SharedUnlockOperation | Promise<SharedUnlockOperation> } = {}) {
  const original = baseline.context
  const masterKey = await randomBytes(32)
  const member = await generateKeyPair()
  useAuthStore.getState().setTokens({ accessToken: 'own-source-access', refreshToken: 'own-source-refresh', userId: original.accountId, isOnboarded: true })
  useAuthStore.getState().unlockVault(masterKey, member.privateKey, original)
  holder.snapshot = { preference: { sharedUnlockEnabled: true, revision: original.preferenceRevision }, sourceGeneration: original.webGeneration,
    authorization: { authorizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sequence: 5,
      accountId: original.accountId, organizationId: original.organizationId,
      credentialRevision: baseline.keyContext.credentialRevision, privateKeyWrapRevision: baseline.keyContext.privateKeyWrapRevision,
      authorizationVersion: original.authorizationVersion, unlockedAtMs: original.unlockedAtMs, idleDeadlineMs: original.idleDeadlineMs,
      absoluteDeadlineMs: original.absoluteDeadlineMs, offlineDeadlineMs: original.offlineDeadlineMs } }
  const routeAbort = new AbortController()
  const route: SharedUnlockSourceRoute = { apiUrl, signal: routeAbort.signal, binding: {
    accountId: original.accountId, organizationId: original.organizationId, apiOrigin: apiUrl,
    webOrigin: original.webOrigin, extensionId: original.extensionId, documentBinding: original.documentBinding,
    webGeneration: original.webGeneration, extensionGeneration: original.extensionGeneration,
    linkId: original.linkId, linkEpoch: original.linkEpoch, preferenceRevision: original.preferenceRevision,
  }, assertCurrent: () => { if (routeAbort.signal.aborted) throw new Error('retired') } }
  const recipient = await createSharedUnlockOffer({ role: 'recipient', assertCurrent: () => {} })
  const signer = await createSharedUnlockIdentityProofSigner({ assertCurrent: () => {} })
  const keyContext = { ...baseline.keyContext, publicKey: toBase64Url(member.publicKey), encryptedPrivateKey: toBase64Url(await encryptWithKey(member.privateKey, masterKey)) }
  const pending = deferred<Response>()
  let operation: SharedUnlockOperation | null = null
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    expect(url).toBe(apiUrl + '/api/account/shared-unlock/operations')
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store' })
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer own-source-access')
    const input = JSON.parse(String(init?.body)) as SharedUnlockOperationInput & { refreshToken: string }
    expect(input.refreshToken).toBe('own-source-refresh')
    expect(input.authorizationId).toBe(holder.snapshot.authorization?.authorizationId)
    const context = { ...original, ...route.binding, keyContextDigest: await hashSharedUnlockKeyContext(keyContext),
      idleDeadlineMs: input.idleDeadlineMs, absoluteDeadlineMs: input.absoluteDeadlineMs, offlineDeadlineMs: input.offlineDeadlineMs }
    const created: SharedUnlockOperation = { ...baseline, context, keyContext, sourcePublicKey: input.sourcePublicKey,
      recipientPublicKey: input.recipientPublicKey, recipientProofPublicKey: input.recipientProofPublicKey,
      transcriptHash: await hashSharedUnlockTranscript(context, input.sourcePublicKey, input.recipientPublicKey) }
    operation = options.transform ? await options.transform(created) : created
    return options.pause ? pending.promise : new Response(JSON.stringify(operation))
  })
  const source = await beginSharedUnlockSource(route, new SharedUnlockApi(fetcher, () => apiUrl))
  cleanups.push(source.cancel, () => { recipient.dispose(); signer.dispose(); masterKey.fill(0); member.privateKey.fill(0) })
  return { source, route, recipient, signer, masterKey, member, fetcher, pending, operation: () => operation,
    input: { recipientPublicKey: recipient.publicKey, recipientProofPublicKey: signer.publicKey }, routeAbort }
}

describe('Web one-shot source transaction with real crypto', () => {
  it('creates an own authorized operation and an envelope that recovers the correct Member/Entry key', async () => {
    const f = await setup(); const before = useAuthStore.getState(); const limits = { ...before.unlockLimits! }
    const result = await f.source.create(f.input)
    expect(Object.keys(result).sort()).toEqual(['envelope', 'operation'])
    expect(JSON.stringify(result)).not.toContain('own-source-')
    const request = JSON.parse(String(f.fetcher.mock.lastCall![1]!.body))
    expect(request).toMatchObject({ idleDeadlineMs: limits.idleDeadlineMs, absoluteDeadlineMs: limits.absoluteDeadlineMs, offlineDeadlineMs: limits.offlineDeadlineMs })
    const receiver = f.recipient.bind(result.operation.context)
    const mk = await receiver.open(result.envelope, f.source.publicKey)
    const keys = await recoverSharedUnlockKeys(mk, result.operation.keyContext, result.operation.context.accountId,
      result.operation.context.keyContextDigest, () => {})
    const wrapped = await sealVaultKey(f.member.privateKey); const vk = await unsealVaultKey(wrapped, f.member.privateKey)
    const entry = await encryptEntry({ type: ENTRY_TYPE_KEY, value: 'synthetic-source-test' }, vk); vk.fill(0)
    const receivedVk = await unsealVaultKey(wrapped, keys.privateKey)
    expect(await decryptEntry(entry, receivedVk)).toEqual({ type: ENTRY_TYPE_KEY, value: 'synthetic-source-test' })
    receivedVk.fill(0); keys.masterKey.fill(0); keys.privateKey.fill(0); receiver.dispose()
    expect(useAuthStore.getState().masterKey).toBe(before.masterKey); expect(useAuthStore.getState().unlockLimits).toEqual(limits)
    await expect(f.source.create(f.input)).rejects.toMatchObject({ code: 'conflict' })
    f.routeAbort.abort(); expect(useAuthStore.getState().isVaultLocked).toBe(false)
  })
  it.each(['accountId', 'organizationId', 'apiOrigin', 'webOrigin', 'extensionId', 'documentBinding', 'webGeneration',
    'extensionGeneration', 'linkId', 'linkEpoch', 'preferenceRevision', 'authorizationVersion', 'direction'] as const)('rejects substituted crypto scope %s', async field => {
    const f = await setup({ transform: op => ({ ...op, context: { ...op.context, [field]: typeof op.context[field] === 'number' ? Number(op.context[field]) + 1 : 'substituted' } }) })
    await expect(f.source.create(f.input)).rejects.toThrow(); expect(useAuthStore.getState().isVaultLocked).toBe(false)
  })
  it.each(['sourcePublicKey', 'recipientPublicKey', 'recipientProofPublicKey', 'transcriptHash'] as const)('rejects substituted participant/transcript %s', async field => {
    const f = await setup({ transform: op => ({ ...op, [field]: toBase64Url(new Uint8Array(32).fill(7)) }) })
    await expect(f.source.create(f.input)).rejects.toThrow(); expect(useAuthStore.getState().isVaultLocked).toBe(false)
  })
  it('projects only public protocol fields even when Identity adds unrelated response fields', async () => {
    const f = await setup({ transform: op => ({ ...op, session: { accessToken: 'synthetic-extra-outer' },
      context: { ...op.context, refreshToken: 'synthetic-extra-context' },
      keyContext: { ...op.keyContext, privateKey: 'synthetic-extra-descriptor' } }) })
    const packet = await f.source.create(f.input)
    expect(JSON.stringify(packet)).not.toContain('synthetic-extra-')
    expect(packet.operation.context).toEqual(packet.envelope.context)
    expect(Object.keys(packet.operation).sort()).toEqual(Object.keys(baseline).sort())
    expect(Object.keys(packet.operation.context).sort()).toEqual(Object.keys(baseline.context).sort())
    expect(Object.keys(packet.operation.keyContext).sort()).toEqual(Object.keys(baseline.keyContext).sort())
  })
  it('rejects a key descriptor changed outside its committed digest', async () => {
    const f = await setup({ transform: op => ({ ...op, keyContext: { ...op.keyContext, publicKey: toBase64Url(new Uint8Array(32).fill(7)) } }) })
    await expect(f.source.create(f.input)).rejects.toThrow(); expect(useAuthStore.getState().masterKey).not.toBeNull()
  })
  it('rejects a self-consistent substituted descriptor against the independently held own member key', async () => {
    const other = await generateKeyPair()
    const f = await setup({ transform: async op => {
      const keyContext = { ...op.keyContext, publicKey: toBase64Url(other.publicKey),
        encryptedPrivateKey: toBase64Url(await encryptWithKey(other.privateKey, f.masterKey)) }
      const context = { ...op.context, keyContextDigest: await hashSharedUnlockKeyContext(keyContext) }
      return { ...op, keyContext, context, transcriptHash: await hashSharedUnlockTranscript(context, op.sourcePublicKey, op.recipientPublicKey) }
    } })
    try { await expect(f.source.create(f.input)).rejects.toThrow('Shared unlock own member key differs') }
    finally { other.privateKey.fill(0) }
    expect(useAuthStore.getState().isVaultLocked).toBe(false)
  })
  it('rejects a different locally held private key even if the descriptor decrypts successfully', async () => {
    const f = await setup(); useAuthStore.getState().privateKey!.fill(8)
    await expect(f.source.create(f.input)).rejects.toThrow('Shared unlock own member key differs')
  })
  it.each(['lock', 'logout', 'expire', 'manual', 'route', 'off', 'preference', 'root', 'refresh', 'cancel', 'deadline'] as const)('does not release an envelope after %s while Identity is pending', async action => {
    const f = await setup({ pause: true }); const pending = f.source.create(f.input); const rejected = expect(pending).rejects.toThrow()
    await vi.waitFor(() => expect(f.operation()).not.toBeNull())
    if (action === 'lock') useAuthStore.getState().lockVault()
    if (action === 'logout') useAuthStore.getState().logout()
    if (action === 'expire') useAuthStore.getState().expireSession()
    if (action === 'manual') beginManualUnlockAttempt()
    if (action === 'route') f.routeAbort.abort()
    if (action === 'off') holder.snapshot.preference = { ...holder.snapshot.preference!, sharedUnlockEnabled: false }
    if (action === 'preference') holder.snapshot.preference = { ...holder.snapshot.preference!, revision: holder.snapshot.preference!.revision + 1 }
    if (action === 'root') holder.snapshot.authorization = null
    if (action === 'refresh') useAuthStore.setState({ refreshToken: 'new-own-refresh' })
    if (action === 'cancel') f.source.cancel()
    if (action === 'deadline') vi.mocked(Date.now).mockReturnValue(holder.snapshot.authorization!.idleDeadlineMs)
    f.pending.resolve(new Response(JSON.stringify(f.operation()))); await rejected
    expect(f.fetcher).toHaveBeenCalledOnce()
  })
  it.each(['off', 'generation', 'account', 'organization', 'authorizationVersion', 'credentialRevision', 'privateKeyWrapRevision', 'expired'] as const)('rejects stale own %s authority before Identity', async reason => {
    const f = await setup()
    if (reason === 'off') holder.snapshot.preference = { ...holder.snapshot.preference!, sharedUnlockEnabled: false }
    if (reason === 'generation') holder.snapshot.sourceGeneration = 'different-channel-is-not-source-generation'
    if (reason === 'account') holder.snapshot.authorization = { ...holder.snapshot.authorization!, accountId: 'other-account' }
    if (reason === 'organization') holder.snapshot.authorization = { ...holder.snapshot.authorization!, organizationId: 'other-org' }
    if (reason === 'authorizationVersion' || reason === 'credentialRevision' || reason === 'privateKeyWrapRevision')
      holder.snapshot.authorization = { ...holder.snapshot.authorization!, [reason]: holder.snapshot.authorization![reason] + 1 }
    if (reason === 'expired') vi.mocked(Date.now).mockReturnValue(holder.snapshot.authorization!.idleDeadlineMs)
    await expect(f.source.create(f.input)).rejects.toThrow()
    expect(f.fetcher).not.toHaveBeenCalled()
  })
  it('disposes an unused source on its own 30-second deadline', async () => {
    vi.useFakeTimers(); const f = await setup(); await vi.advanceTimersByTimeAsync(30000)
    await expect(f.source.create(f.input)).rejects.toThrow(); expect(f.fetcher).not.toHaveBeenCalled()
  })
  it('cancels a stalled Identity request promptly without waiting for its ignored abort', async () => {
    const f = await setup({ pause: true }); const result = f.source.create(f.input); const rejected = expect(result).rejects.toThrow()
    await vi.waitFor(() => expect(f.fetcher).toHaveBeenCalledOnce()); f.routeAbort.abort(); await rejected
  })
})
