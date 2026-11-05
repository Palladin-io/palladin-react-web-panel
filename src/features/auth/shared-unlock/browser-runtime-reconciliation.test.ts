import { afterEach, expect, it, vi } from 'vitest'
import { createSharedUnlockOffer, encryptWithKey, generateKeyPair, hashSharedUnlockKeyContext,
  hashSharedUnlockTranscript, randomBytes, toBase64Url } from '@palladin/crypto'
import { coordinateSharedUnlockBrowser } from './browser-runtime'
import type { SharedUnlockBrowserRoute } from './browser-channel'
import type { SharedUnlockOperationMessage } from './browser-operation-message'
import type { SharedUnlockOperation } from './api-types'
import { sharedUnlockLinks } from './link-runtime'
import { sharedUnlockPreferences } from './preference-state-runtime'
import { useAuthStore } from '../stores/auth-store'
import fixtures from './fixtures/browser-session-api'

vi.mock('../../../shared/lib/env', () => ({ env: { apiUrl: 'https://api.example.test', sharedUnlockExtensionId: '' } }))
const baseline = fixtures.responses.find(r => r.type === 'operation' && r.body.context?.direction === 'extension-to-web')!.body as SharedUnlockOperation
const apiUrl = 'https://api.example.test'
const previousId = '99999999-9999-4999-8999-999999999999'
const cleanup: (() => void)[] = []
afterEach(() => {
  for (const close of cleanup.splice(0)) close()
  useAuthStore.getState().logout(); localStorage.clear(); sharedUnlockPreferences.clear()
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})

it.each([false, true])('installs keys through the real browser receiver after reinstall (tokenless=%s)', async tokenless => {
  vi.spyOn(Date, 'now').mockReturnValue(baseline.context.issuedAtMs)
  const tails = new Map<string, Promise<unknown>>()
  vi.stubGlobal('navigator', { locks: { request: (name: string, action: () => Promise<unknown>) => {
    const next = (tails.get(name) ?? Promise.resolve()).then(action); tails.set(name, next.catch(() => {})); return next
  } } })
  useAuthStore.getState().logout()
  if (!tokenless) useAuthStore.setState({ userId: baseline.context.accountId, accessToken: 'old-access', sessionId: 'old-session' })
  const scope = { apiUrl, accountId: baseline.context.accountId, webOrigin: baseline.context.webOrigin, extensionId: baseline.context.extensionId }
  const previous = { linkId: previousId, state: 'active' as const, revision: 2, epoch: 1, lastInvalidationSequence: 4, lastLogoutSequence: 0 }
  const target = { ...previous, linkId: previousId, epoch: baseline.context.linkEpoch, lastInvalidationSequence: 0 }
  await sharedUnlockLinks.adopt(scope, previousId); await sharedUnlockLinks.observe(scope, previous)
  const abort = new AbortController(), listeners = new Set<(message: SharedUnlockOperationMessage) => void>()
  const sent: SharedUnlockOperationMessage[] = []
  const route: SharedUnlockBrowserRoute = { ...scope, channelId: 'A'.repeat(43), documentBinding: baseline.context.documentBinding,
    signal: abort.signal, close: () => abort.abort(), assertCurrent: () => { if (abort.signal.aborted) throw new Error('closed') },
    verifyCurrent: async () => route.assertCurrent(), sendOperation: message => sent.push(message),
    onOperation: listener => { listeners.add(listener); return () => { listeners.delete(listener) } } }
  const emit = (message: SharedUnlockOperationMessage) => { for (const listener of listeners) listener(message) }
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const path = String(url)
    let body: unknown
    if (path.endsWith('/consume')) body = operation
    else if (path.endsWith('/commit')) body = { context: operation.context, authorizationId: '88888888-8888-4888-8888-888888888888', authorizationSequence: 5,
      session: { accessToken: 'new-own-access', sessionId: 'new-own-session', userId: scope.accountId, isOnboarded: true,
        emailVerified: true, waitlistDeveloperBenefitStartedAt: null, waitlistDeveloperBenefitEndsAt: null } }
    else if (path.endsWith('/' + previousId) || path.endsWith('/' + target.linkId)) {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer new-own-access')
      body = target
    } else if (path.endsWith('/session-state')) body = { action: 'none', link: null }
    else if (path.endsWith('/shared-unlock')) body = { sharedUnlockEnabled: true, revision: baseline.context.preferenceRevision }
    else throw new Error('Unexpected API path')
    return new Response(JSON.stringify(body))
  })
  vi.stubGlobal('fetch', fetcher)
  const runtime = coordinateSharedUnlockBrowser(route); cleanup.push(() => { runtime.close(); route.close() })
  await vi.waitFor(() => expect(sent.some(message => message.payload.kind === 'state')).toBe(true))
  const own = sent.filter(message => message.payload.kind === 'state').at(-1)!
  if (own.payload.kind !== 'state') throw new Error('Missing own state')
  const peerId = 'C'.repeat(42) + 'A', generation = 'D'.repeat(42) + 'A', attemptId = 'E'.repeat(42) + 'A'
  emit({ attemptId: peerId, payload: { kind: 'state', stateId: peerId, accountId: scope.accountId, status: 'unlocked', generation,
    source: { organizationId: baseline.context.organizationId } } })
  emit({ attemptId: peerId, payload: { kind: 'link', accountId: scope.accountId, linkId: baseline.context.linkId, webStateId: own.attemptId, extensionStateId: peerId } })
  await vi.waitFor(() => expect(sent.some(message => message.payload.kind === 'link-selected')).toBe(true))
  expect((await sharedUnlockLinks.read(scope))?.linkId).toBe(previousId)
  expect(sent.find(message => message.payload.kind === 'link-selected')?.payload).toMatchObject({ linkId: previousId })
  emit({ attemptId: peerId, payload: { kind: 'link', accountId: scope.accountId, linkId: previousId, webStateId: own.attemptId, extensionStateId: peerId } })
  await vi.waitFor(() => expect(sent.filter(message => message.payload.kind === 'link-selected')).toHaveLength(2))
  emit({ attemptId, payload: { kind: 'prepare', accountId: scope.accountId, organizationId: baseline.context.organizationId,
    linkId: target.linkId, linkEpoch: target.epoch, preferenceRevision: baseline.context.preferenceRevision,
    webStateId: own.attemptId, extensionStateId: peerId } })
  await vi.waitFor(() => expect(sent.some(message => message.payload.kind === 'prepared')).toBe(true))
  const source = await createSharedUnlockOffer({ role: 'source', assertCurrent: () => {} }); cleanup.push(() => source.dispose())
  emit({ attemptId, payload: { kind: 'source-offer', publicKey: source.publicKey } })
  await vi.waitFor(() => expect(sent.some(message => message.payload.kind === 'receiver-offer')).toBe(true))
  const offer = sent.find(message => message.payload.kind === 'receiver-offer')!.payload
  if (offer.kind !== 'receiver-offer') throw new Error('Missing receiver offer')
  const masterKey = await randomBytes(32), member = await generateKeyPair()
  cleanup.push(() => { masterKey.fill(0); member.privateKey.fill(0) })
  const keyContext = { ...baseline.keyContext, publicKey: toBase64Url(member.publicKey), encryptedPrivateKey: toBase64Url(await encryptWithKey(member.privateKey, masterKey)) }
  const context = { ...baseline.context, linkId: target.linkId, webGeneration: own.payload.generation, extensionGeneration: generation, keyContextDigest: await hashSharedUnlockKeyContext(keyContext) }
  const operation: SharedUnlockOperation = { ...baseline, context, keyContext, sourcePublicKey: source.publicKey, recipientPublicKey: offer.publicKey,
    recipientProofPublicKey: offer.proofPublicKey, transcriptHash: await hashSharedUnlockTranscript(context, source.publicKey, offer.publicKey) }
  const participant = source.bind(context); cleanup.push(() => participant.dispose())
  emit({ attemptId, payload: { kind: 'handoff', operation, envelope: await participant.seal(masterKey, offer.publicKey) } })
  await vi.waitFor(() => expect(useAuthStore.getState().isVaultLocked).toBe(false))
  expect(useAuthStore.getState().masterKey).toEqual(masterKey)
  expect(useAuthStore.getState().privateKey).toEqual(member.privateKey)
  expect(useAuthStore.getState().accessToken).toBe('new-own-access')
  expect((await sharedUnlockLinks.read(scope))?.linkId).toBe(target.linkId)
  expect(sent.some(message => message.payload.kind === 'ack')).toBe(true)
})
