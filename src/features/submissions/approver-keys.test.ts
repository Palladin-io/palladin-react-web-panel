import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApproverKeysResponse } from './api/submissions-api'

const ORG = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a'
const USER = '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c'

function token(org: string): string {
  return `h.${btoa(JSON.stringify({ org_id: org })).replaceAll('=', '')}.s`
}

const mocks = vi.hoisted(() => ({
  state: { privateKey: null as Uint8Array | null, accessToken: '', userId: '' },
  getAccount: vi.fn(),
  getApproverKeys: vi.fn(),
  issueApproverKeyChallenge: vi.fn(),
  submitApproverKeySetChange: vi.fn(),
  openOwnApproverKeys: vi.fn(),
  buildApproverKeySetChange: vi.fn(),
}))

vi.mock('../auth', () => ({ useAuthStore: { getState: () => mocks.state } }))
vi.mock('../../shared/api/account-api', () => ({ getAccount: mocks.getAccount }))
vi.mock('./api/submissions-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/submissions-api')>()),
  getApproverKeys: mocks.getApproverKeys,
  issueApproverKeyChallenge: mocks.issueApproverKeyChallenge,
  submitApproverKeySetChange: mocks.submitApproverKeySetChange,
}))
vi.mock('../../shared/crypto/agent-submission', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/crypto/agent-submission')>()),
  openOwnApproverKeys: mocks.openOwnApproverKeys,
  buildApproverKeySetChange: mocks.buildApproverKeySetChange,
}))

import {
  ApproverKeysLockedError,
  ApproverKeysNotServedError,
  currentMemberAuthority,
  loadOwnApproverKeys,
  nextApproverKeyAction,
  runApproverKeyChange,
} from './approver-keys'

const approver = (memberId: string, hasWrap: boolean) => ({
  memberId, memberKeyVersion: 1, memberKeyFingerprint: 'f', memberPublicKey: 'p', hasWrap,
})

function state(overrides: Partial<ApproverKeysResponse> = {}): ApproverKeysResponse {
  return {
    status: 'ready', keyVersion: 1, approverSetRevision: '1',
    manifest: { keyVersion: 1, manifestRevision: '1' } as ApproverKeysResponse['manifest'],
    myWraps: [{}, {}] as ApproverKeysResponse['myWraps'],
    approvers: [approver(USER, true)], approverSetDigest: 'd', rotationRequired: false,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state = { privateKey: new Uint8Array(32).fill(3), accessToken: token(ORG), userId: USER }
  mocks.getAccount.mockResolvedValue({ userId: USER, memberKeyVersion: 2 })
  mocks.issueApproverKeyChallenge.mockResolvedValue({ challengeId: 'c1', issuedAt: 'now', approverSetRevision: '2', approvers: [] })
  mocks.buildApproverKeySetChange.mockResolvedValue({ manifest: { m: 1 }, wraps: [] })
  mocks.openOwnApproverKeys.mockImplementation(async () => ({
    keyVersion: 1, messagePrivateKey: new Uint8Array(32).fill(5), signingSeed: new Uint8Array(32).fill(6),
  }))
})

describe('nextApproverKeyAction', () => {
  it('bootstraps an absent set, rotates before adding and never re-bootstraps automatically', () => {
    expect(nextApproverKeyAction(state({ status: 'absent', manifest: null, myWraps: null }))).toBe('bootstrap')
    expect(nextApproverKeyAction(state())).toBeNull()
    expect(nextApproverKeyAction(state({ approvers: [approver(USER, true), approver('n', false)] }))).toBe('addApprovers')
    expect(nextApproverKeyAction(state({ rotationRequired: true, approvers: [approver('n', false)] }))).toBe('rotate')
    expect(nextApproverKeyAction(state({ status: 'unavailable' }))).toBeNull()
    expect(nextApproverKeyAction(state({ status: 'future-state' }))).toBeNull()
  })

  it('leaves a ready set alone when the caller holds no current wraps', () => {
    expect(nextApproverKeyAction(state({ myWraps: [], rotationRequired: true }))).toBeNull()
    expect(nextApproverKeyAction(state({ myWraps: [], approvers: [approver('n', false)] }))).toBeNull()
  })
})

describe('currentMemberAuthority', () => {
  it('combines the JWT organization, Identity key version and the in-memory Member key', async () => {
    await expect(currentMemberAuthority()).resolves.toEqual({
      organizationId: ORG, memberId: USER, memberKeyVersion: 2, memberPrivateKey: mocks.state.privateKey,
    })
  })

  it('refuses a locked session, another principal or a missing key version', async () => {
    mocks.getAccount.mockResolvedValueOnce({ userId: 'someone-else', memberKeyVersion: 2 })
    await expect(currentMemberAuthority()).rejects.toBeInstanceOf(ApproverKeysLockedError)
    mocks.getAccount.mockResolvedValueOnce({ userId: USER, memberKeyVersion: null })
    await expect(currentMemberAuthority()).rejects.toBeInstanceOf(ApproverKeysLockedError)
    mocks.state.privateKey = null
    await expect(currentMemberAuthority()).rejects.toBeInstanceOf(ApproverKeysLockedError)
  })
})

describe('loadOwnApproverKeys', () => {
  it('refuses to open keys for a caller without current wraps', async () => {
    mocks.getApproverKeys.mockResolvedValue(state({ myWraps: [] }))
    await expect(loadOwnApproverKeys()).rejects.toBeInstanceOf(ApproverKeysNotServedError)
    expect(mocks.openOwnApproverKeys).not.toHaveBeenCalled()
  })
})

describe('runApproverKeyChange', () => {
  it('rotates with the opened current keys, posts to the rotation route and wipes them', async () => {
    const current = state({ rotationRequired: true })
    await runApproverKeyChange('rotate', current)
    const opened = await mocks.openOwnApproverKeys.mock.results[0].value
    expect(mocks.buildApproverKeySetChange).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'rotate', organizationId: ORG, memberId: USER, currentManifest: current.manifest, currentKeys: opened,
    }))
    expect(mocks.submitApproverKeySetChange).toHaveBeenCalledWith('rotate', { challengeId: 'c1', manifest: { m: 1 }, wraps: [] })
    expect(opened.messagePrivateKey.every((byte: number) => byte === 0)).toBe(true)
    expect(opened.signingSeed.every((byte: number) => byte === 0)).toBe(true)
  })

  it('bootstraps and re-bootstraps without opening existing keys', async () => {
    await runApproverKeyChange('bootstrap', state({ status: 'absent', manifest: null, myWraps: null }))
    await runApproverKeyChange('rebootstrap', state({ status: 'unavailable', myWraps: [] }))
    expect(mocks.openOwnApproverKeys).not.toHaveBeenCalled()
    expect(mocks.submitApproverKeySetChange.mock.calls.map(([route]) => route)).toEqual(['bootstrap', 'rebootstrap'])
  })

  it('discards material when the unlock session changed before upload', async () => {
    mocks.buildApproverKeySetChange.mockImplementation(async () => {
      mocks.state.privateKey = new Uint8Array(32).fill(8)
      return { manifest: {}, wraps: [] }
    })
    await expect(runApproverKeyChange('addApprovers', state())).rejects.toBeInstanceOf(ApproverKeysLockedError)
    expect(mocks.submitApproverKeySetChange).not.toHaveBeenCalled()
  })
})
