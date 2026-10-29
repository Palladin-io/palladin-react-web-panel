import 'fake-indexeddb/auto'
import type { ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import sodium from 'libsodium-wrappers'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AgentSubmissionCryptoError,
  openOwnApproverKeys,
  type AgentEntrySubmission,
  type ApproverKeyWrap,
  type OrganizationApproverManifest,
} from '../../shared/crypto/agent-submission'
import { concatBytes, encodeBase64Url } from '../../shared/crypto/vault-v2-bytes'
import { signVaultObject, type CanonicalJson } from '../../shared/crypto/vault-v2-signatures'
import { VAULT_KEY_KIND, computeVaultKeyFingerprint } from '../../shared/crypto/x25519-wrapper'
import { analytics } from '../../shared/lib/analytics'
import { PERMISSION_GRANT_MANAGE } from '../../shared/lib/permissions'
import { useAuthStore } from '../auth'
import type { ApproverKeySetChangeBody, ApproverKeysResponse, SubmissionListItem } from './api/submissions-api'

const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'src/shared/crypto/fixtures/agent-submission-v1/fixture.json'), 'utf8')) as {
  deterministicInputs: Record<string, string>
  context: { organizationId: string; agentId: string; memberId: string; memberKeyVersion: number; agentEd25519PublicKey: string }
  approverManifests: OrganizationApproverManifest[]
  approverKeyWraps: ApproverKeyWrap[]
  submissions: AgentEntrySubmission[]
  expectedPlaintext: { content: { password: string } }
}

const mocks = vi.hoisted(() => ({
  getAccount: vi.fn(),
  getApproverKeys: vi.fn(),
  getSubmission: vi.fn(),
  issueApproverKeyChallenge: vi.fn(),
  submitApproverKeySetChange: vi.fn(),
}))

vi.mock('../../shared/api/account-api', () => ({ getAccount: mocks.getAccount }))
vi.mock('./api/submissions-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/submissions-api')>()),
  getApproverKeys: mocks.getApproverKeys,
  getSubmission: mocks.getSubmission,
  issueApproverKeyChallenge: mocks.issueApproverKeyChallenge,
  submitApproverKeySetChange: mocks.submitApproverKeySetChange,
}))

import { runApproverKeyChange } from './approver-keys'
import { useSubmissionReview } from './use-submissions'

const hex = (value: string) => Uint8Array.from(Buffer.from(value, 'hex'))
let member: { publicKey: Uint8Array; privateKey: Uint8Array }
let memberFingerprint: string
const secretsSeen: Uint8Array[] = []
const spies: ReturnType<typeof vi.spyOn>[] = []

const readyState = (): ApproverKeysResponse => ({
  status: 'ready', keyVersion: 1, approverSetRevision: '1', manifest: fixture.approverManifests[0],
  myWraps: fixture.approverKeyWraps, approvers: [], approverSetDigest: fixture.approverManifests[0].approverSetDigest,
  rotationRequired: false,
})

const item: SubmissionListItem = {
  submissionId: fixture.submissions[0].submissionId, agentId: fixture.context.agentId, agentName: 'Agent',
  submissionKind: 2, entryType: 1, target: fixture.submissions[0].target, suggestedVaultId: null, state: 'pending',
  agentUseSuspended: false, createdAt: '2026-10-29T08:00:00Z', approverKeyVersion: 1,
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function encodings(bytes: Uint8Array): string[] {
  return [encodeBase64Url(bytes), Buffer.from(bytes).toString('base64'), Buffer.from(bytes).toString('hex')]
}

function storedText(): string {
  const read = (storage: Storage) => Array.from({ length: storage.length }, (_, index) => {
    const key = storage.key(index)!
    return `${key}=${storage.getItem(key)}`
  }).join('\n')
  return `${read(localStorage)}\n${read(sessionStorage)}`
}

beforeAll(async () => {
  await sodium.ready
  member = sodium.crypto_box_seed_keypair(hex(fixture.deterministicInputs.memberX25519Seed))
  memberFingerprint = encodeBase64Url(await computeVaultKeyFingerprint(member.publicKey, VAULT_KEY_KIND.memberX25519))
  secretsSeen.push(
    member.privateKey,
    sodium.crypto_box_seed_keypair(hex(fixture.deterministicInputs.approverV1X25519Seed)).privateKey,
    hex(fixture.deterministicInputs.approverV1Ed25519Seed),
    hex(fixture.deterministicInputs.submissionDek),
  )
})

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  const token = `h.${Buffer.from(JSON.stringify({ org_id: fixture.context.organizationId })).toString('base64url')}.s`
  useAuthStore.setState({
    userId: fixture.context.memberId, accessToken: token, privateKey: new Uint8Array(member.privateKey),
    isVaultLocked: false, permissions: PERMISSION_GRANT_MANAGE, cryptoSessionGeneration: 7,
  })
  mocks.getAccount.mockResolvedValue({ userId: fixture.context.memberId, memberKeyVersion: fixture.context.memberKeyVersion })
  mocks.getApproverKeys.mockResolvedValue(readyState())
  mocks.getSubmission.mockResolvedValue({
    submission: fixture.submissions[0], agentEd25519PublicKey: fixture.context.agentEd25519PublicKey, agentEd25519KeyVersion: 1,
  })
  spies.push(vi.spyOn(indexedDB, 'open'), vi.spyOn(analytics, 'capture'))
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, method))
})

afterEach(() => {
  const persisted = storedText()
  for (const secret of secretsSeen) for (const encoded of encodings(secret)) expect(persisted).not.toContain(encoded)
  expect(persisted).not.toContain(fixture.expectedPlaintext.content.password)
  const [openIndexedDb, ...observers] = spies
  expect(openIndexedDb).not.toHaveBeenCalled()
  for (const spy of observers) expect(JSON.stringify(spy.mock.calls)).not.toContain(fixture.expectedPlaintext.content.password)
  for (const spy of spies) spy.mockRestore()
  spies.length = 0
})

describe('submission review pipeline with the real crypto layer', () => {
  it('opens a fixture submission with keys unwrapped from the caller\'s own wraps, persisting nothing', async () => {
    const { result } = renderHook(() => useSubmissionReview(item), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.payload).toEqual(fixture.expectedPlaintext)
  })

  it('refuses a server-tampered envelope with a value-free code', async () => {
    mocks.getSubmission.mockResolvedValue({
      submission: { ...fixture.submissions[0], target: { ...fixture.submissions[0].target, expectedEntryRevision: '6' } },
      agentEd25519PublicKey: fixture.context.agentEd25519PublicKey, agentEd25519KeyVersion: 1,
    })
    const { result } = renderHook(() => useSubmissionReview(item), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(AgentSubmissionCryptoError)
    expect((result.current.error as AgentSubmissionCryptoError).code).toBe('invalid-agent-signature')
  })

  it('refuses a decrypted payload that violates the contract before anything is shown', async () => {
    const source = fixture.submissions[0]
    const identity = Object.fromEntries(['contractVersion', 'protocolVersion', 'organizationId', 'submissionId', 'agentId',
      'submissionKind', 'entryType', 'target'].map((key) => [key, source[key as keyof AgentEntrySubmission]]))
    const canonical = (value: unknown): string => value === null || typeof value !== 'object' ? JSON.stringify(value)
      : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
    const payload = { ...fixture.expectedPlaintext, content: { ...fixture.expectedPlaintext.content, url: 'http://example.invalid/login' } }
    const nonce = hex(fixture.deterministicInputs.payloadNonce)
    const encoder = new TextEncoder()
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(new Uint8Array(encoder.encode(canonical(payload))),
      concatBytes(encoder.encode('PLDNSUB1AAD'), encoder.encode(canonical(identity))), null, nonce, hex(fixture.deterministicInputs.submissionDek))
    const unsigned = { ...source, encodedPayload: encodeBase64Url(concatBytes(nonce, ciphertext)) } as Record<string, unknown>
    delete unsigned.agentSignature
    const agentSigning = sodium.crypto_sign_seed_keypair(hex(fixture.deterministicInputs.agentEd25519Seed))
    mocks.getSubmission.mockResolvedValue({
      submission: { ...unsigned, agentSignature: await signVaultObject('PLDNSUB1SIG:AGENT-SUBMISSION:', unsigned as CanonicalJson, agentSigning.privateKey) },
      agentEd25519PublicKey: fixture.context.agentEd25519PublicKey, agentEd25519KeyVersion: 1,
    })
    const { result } = renderHook(() => useSubmissionReview(item), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as AgentSubmissionCryptoError).code).toBe('invalid-field')
    expect(result.current.data).toBeUndefined()
  })

  it('refuses a correctly signed submission other than the one requested', async () => {
    const source = fixture.submissions[0]
    const unsigned = { ...source, submissionId: '1d1d1d1d-1d1d-4d1d-8d1d-1d1d1d1d1d1d' } as Record<string, unknown>
    delete unsigned.agentSignature
    const agentSigning = sodium.crypto_sign_seed_keypair(hex(fixture.deterministicInputs.agentEd25519Seed))
    mocks.getSubmission.mockResolvedValue({
      submission: { ...unsigned, agentSignature: await signVaultObject('PLDNSUB1SIG:AGENT-SUBMISSION:', unsigned as CanonicalJson, agentSigning.privateKey) },
      agentEd25519PublicKey: fixture.context.agentEd25519PublicKey, agentEd25519KeyVersion: 1,
    })
    const { result } = renderHook(() => useSubmissionReview(item), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as AgentSubmissionCryptoError).code).toBe('context-mismatch')
    expect(result.current.data).toBeUndefined()
  })

  it('refuses a submission whose Agent is not the one listed for review', async () => {
    const { result } = renderHook(() => useSubmissionReview({ ...item, agentId: '1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b' }), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as AgentSubmissionCryptoError).code).toBe('context-mismatch')
  })

  it('refuses to open wraps served for another Member key version', async () => {
    mocks.getAccount.mockResolvedValue({ userId: fixture.context.memberId, memberKeyVersion: 3 })
    const { result } = renderHook(() => useSubmissionReview(item), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as AgentSubmissionCryptoError).code).toBe('approver-not-recipient')
  })
})

describe('approver key changes with the real crypto layer', () => {
  async function recipient(memberId: string, publicKey: Uint8Array, hasWrap: boolean, memberKeyVersion = 1) {
    return {
      memberId, memberKeyVersion, hasWrap, memberPublicKey: encodeBase64Url(publicKey),
      memberKeyFingerprint: encodeBase64Url(await computeVaultKeyFingerprint(publicKey, VAULT_KEY_KIND.memberX25519)),
    }
  }

  it('bootstraps wraps for exactly the challenge approver set, not a stale GET list', async () => {
    const colleague = sodium.crypto_box_keypair()
    const outsider = sodium.crypto_box_keypair()
    const self = { memberId: fixture.context.memberId, memberKeyVersion: 2, memberKeyFingerprint: memberFingerprint,
      memberPublicKey: encodeBase64Url(member.publicKey), hasWrap: false }
    const colleagueId = '2c2c2c2c-2c2c-4c2c-8c2c-2c2c2c2c2c2c'
    mocks.issueApproverKeyChallenge.mockResolvedValue({
      challengeId: 'c1', issuedAt: '2026-10-29T08:00:00Z', approverSetRevision: '1', approverSetDigest: 'ignored',
      approvers: [self, await recipient(colleagueId, colleague.publicKey, false)], expiresAt: '',
    })
    await runApproverKeyChange('bootstrap', {
      ...readyState(), status: 'absent', manifest: null, myWraps: null,
      approvers: [self, await recipient('3c3c3c3c-3c3c-4c3c-8c3c-3c3c3c3c3c3c', outsider.publicKey, false)],
    })
    const [route, body] = mocks.submitApproverKeySetChange.mock.calls[0] as [string, ApproverKeySetChangeBody]
    expect(route).toBe('bootstrap')
    expect(body.challengeId).toBe('c1')
    expect(body.wraps.map((wrap) => `${wrap.descriptor.memberId}:${wrap.descriptor.purpose}`).sort())
      .toEqual([`${colleagueId}:8`, `${colleagueId}:9`, `${fixture.context.memberId}:8`, `${fixture.context.memberId}:9`].sort())
    expect(body.manifest.continuitySignature).toBeUndefined()
    const opened = await openOwnApproverKeys(body.manifest, body.wraps.filter((wrap) => wrap.descriptor.memberId === fixture.context.memberId), {
      organizationId: fixture.context.organizationId, memberId: fixture.context.memberId,
      memberKeyVersion: 2, memberPrivateKey: member.privateKey,
    })
    secretsSeen.push(new Uint8Array(opened.messagePrivateKey), new Uint8Array(opened.signingSeed))
  })

  it('adds only approvers that the challenge lists without a wrap and keeps the key version', async () => {
    const newcomer = sodium.crypto_box_keypair()
    const newcomerId = '4c4c4c4c-4c4c-4c4c-8c4c-4c4c4c4c4c4c'
    mocks.issueApproverKeyChallenge.mockResolvedValue({
      challengeId: 'c2', issuedAt: '2026-10-29T09:00:00Z', approverSetRevision: '2', approverSetDigest: 'ignored', expiresAt: '',
      approvers: [
        { memberId: fixture.context.memberId, memberKeyVersion: 2, memberKeyFingerprint: memberFingerprint,
          memberPublicKey: encodeBase64Url(member.publicKey), hasWrap: true },
        await recipient(newcomerId, newcomer.publicKey, false),
      ],
    })
    await runApproverKeyChange('addApprovers', readyState())
    const [route, body] = mocks.submitApproverKeySetChange.mock.calls[0] as [string, ApproverKeySetChangeBody]
    expect(route).toBe('add-approvers')
    expect(body.manifest).toMatchObject({ keyVersion: 1, manifestRevision: '2', messagePublicKey: fixture.approverManifests[0].messagePublicKey })
    expect(body.manifest.continuitySignature).toBeUndefined()
    expect(body.wraps.map((wrap) => wrap.descriptor.memberId)).toEqual([newcomerId, newcomerId])
  })
})
