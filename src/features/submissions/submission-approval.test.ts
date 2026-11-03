import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSubmissionPayload } from '../../shared/crypto/agent-submission'
import { defaultAgentVisibilityPolicy, toMemberSecret } from '../../shared/crypto/entry-draft'
import type { MemberSecretV1 } from '../../shared/crypto/vault-plaintext'

const mocks = vi.hoisted(() => ({
  getCanonicalEntry: vi.fn(),
  getEncryptedVault: vi.fn(),
  issueEntryCreationChallenge: vi.fn(),
  openMemberVaultKey: vi.fn(),
  openVaultProjection: vi.fn(),
  sealEntryShareCopy: vi.fn(),
  openVaultDerivedEnvelope: vi.fn(),
  openMemberSecret: vi.fn(),
  sealCanonicalEntry: vi.fn(),
  prepareCanonicalEntryUpdate: vi.fn(),
  buildCanonicalGrantEnvelope: vi.fn(),
  approveSubmissionAsNewEntry: vi.fn(),
  approveSubmissionAsUpdate: vi.fn(),
  privateKey: new Uint8Array(32).fill(7) as Uint8Array | null,
}))

vi.mock('../auth', () => ({ useAuthStore: { getState: () => ({
  privateKey: mocks.privateKey, userId: MEMBER,
  accessToken: `h.${Buffer.from(JSON.stringify({ org_id: ORG })).toString('base64url')}.s`,
}) } }))
vi.mock('../vaults/api/vault-api', () => ({
  getCanonicalEntry: mocks.getCanonicalEntry,
  issueEntryCreationChallenge: mocks.issueEntryCreationChallenge,
}))
vi.mock('../vaults/sync/member-sync-api', () => ({ getEncryptedVault: mocks.getEncryptedVault }))
vi.mock('../vaults/use-update-canonical-entry', () => ({ prepareCanonicalEntryUpdate: mocks.prepareCanonicalEntryUpdate }))
vi.mock('../../shared/crypto/vault-protocol', () => ({
  openMemberVaultKey: mocks.openMemberVaultKey,
  openVaultProjection: mocks.openVaultProjection,
  openVaultDerivedEnvelope: mocks.openVaultDerivedEnvelope,
}))
vi.mock('../../shared/crypto/entry-share-copy-encryption', () => ({ sealEntryShareCopy: mocks.sealEntryShareCopy }))
vi.mock('../../shared/crypto/entry-protocol', () => ({
  openMemberSecret: mocks.openMemberSecret,
  sealCanonicalEntry: mocks.sealCanonicalEntry,
}))
vi.mock('../../shared/crypto/grant-protocol', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/crypto/grant-protocol')>()),
  buildCanonicalGrantEnvelope: mocks.buildCanonicalGrantEnvelope,
}))
vi.mock('./api/submissions-api', () => ({
  approveSubmissionAsNewEntry: mocks.approveSubmissionAsNewEntry,
  approveSubmissionAsUpdate: mocks.approveSubmissionAsUpdate,
}))

import { StaleSubmissionTargetError, SubmissionApprovalLockedError, approveAsNewEntry, approveAsUpdate } from './submission-approval'

const ORG = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a'
const VAULT = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e'
const ENTRY = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f'
const AGENT = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b'
const CUSTOM = '5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e'
const MEMBER = '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c'
const agent = { agentId: AGENT, publicKey: 'agent-public-key', recipientKeyVersion: 3 }

function payload(kind: 'new' | 'update', content: AgentSubmissionPayload['content'], label?: string): AgentSubmissionPayload {
  return {
    schema: 'palladin.agent-submission-payload.v1',
    identity: { submissionKind: kind === 'new' ? 1 : 2, entryType: 1 },
    ...(label ? { label } : {}),
    content,
  }
}

function currentSecret(): MemberSecretV1 {
  const fields = [{ id: CUSTOM, label: 'PIN', type: 'concealed', value: '1234' }]
  return toMemberSecret({
    label: 'Bank', agentLabel: 'Bank agent', type: 1,
    payload: {
      type: 1, username: 'old-user', password: 'old-pass', url: 'https://bank.example.invalid/login',
      totp: 'otpauth://totp/bank?secret=JBSWY3DPEHPK3PXP', notes: 'notes', fields,
    },
    policy: { ...defaultAgentVisibilityPolicy(1, fields), fields: { ...defaultAgentVisibilityPolicy(1, fields).fields, password: 'never' } },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.privateKey = new Uint8Array(32).fill(7)
  mocks.getEncryptedVault.mockResolvedValue({
    id: VAULT,
    organizationId: ORG,
    memberVaultKey: { wrappedVaultKey: { descriptor: { scope: { organizationId: ORG, vaultId: VAULT, memberId: MEMBER } } } },
    discoveryKey: {},
    currentKeyEpoch: { vaultKeyVersion: 2, vdkVersion: 3 },
    memberKeyGeneration: 4,
  })
  mocks.openMemberVaultKey.mockImplementation(async () => new Uint8Array(32).fill(1))
  mocks.openVaultProjection.mockImplementation(async () => ({ vaultKey: new Uint8Array(32).fill(1) }))
  mocks.sealEntryShareCopy.mockImplementation((...args: unknown[]) => mocks.sealCanonicalEntry(...args))
  mocks.openVaultDerivedEnvelope.mockImplementation(async () => new Uint8Array(32).fill(2))
  mocks.issueEntryCreationChallenge.mockResolvedValue({ entryId: ENTRY })
  mocks.sealCanonicalEntry.mockResolvedValue({ entryKey: 'ek', memberIndex: 'mi', memberSecret: 'ms', agentDiscovery: null })
  mocks.buildCanonicalGrantEnvelope.mockResolvedValue({ envelope: true })
  mocks.approveSubmissionAsNewEntry.mockResolvedValue({ submissionId: 's', vaultId: VAULT, entryId: ENTRY, entryRevision: '1', grantId: null })
  mocks.approveSubmissionAsUpdate.mockResolvedValue({ submissionId: 's', vaultId: VAULT, entryId: ENTRY, entryRevision: '8', grantId: null })
})

describe('approveAsNewEntry', () => {
  it('seals a complete revision-1 Entry with the default policy and a single-entry inject grant', async () => {
    await approveAsNewEntry({
      submissionId: 's', vaultId: VAULT, label: ' Reviewed ', agent,
      payload: payload('new', { username: 'u', password: 'p', url: 'https://site.example.invalid' }, 'Agent label'),
    })
    const [secret, vault, authority] = mocks.sealEntryShareCopy.mock.calls[0]
    expect(vault).toMatchObject({ id: VAULT, organizationId: ORG })
    expect(authority).toEqual({ organizationId: ORG, memberId: MEMBER, vaultId: VAULT, entryId: ENTRY })
    expect(secret).toMatchObject({ memberLabel: 'Reviewed', entryType: 'credential' })
    expect(secret.agentFieldAccess).toEqual(toMemberSecret({
      label: 'x', agentLabel: 'x', type: 1, policy: defaultAgentVisibilityPolicy(1),
      payload: { type: 1, username: 'u', password: 'p', url: 'https://site.example.invalid', fields: [] },
    }).agentFieldAccess)
    expect(mocks.buildCanonicalGrantEnvelope).toHaveBeenCalledWith(expect.objectContaining({
      secret, agentId: AGENT, agentPublicKey: 'agent-public-key', recipientKeyVersion: 3, entryId: ENTRY,
      entryRevision: '1', grantEnvelopeRevision: '1', grantKeyVersion: 1, approvedMethods: 4,
    }))
    const call = mocks.buildCanonicalGrantEnvelope.mock.calls[0][0]
    expect(call).not.toHaveProperty('expiresAt')
    expect(call).not.toHaveProperty('remainingUses')
    expect(mocks.approveSubmissionAsNewEntry).toHaveBeenCalledWith('s', {
      vaultId: VAULT,
      entry: { vaultId: VAULT, entryId: ENTRY, deliveryPolicy: 'standard', entryKey: 'ek', memberIndex: 'mi', memberSecret: 'ms', agentDiscovery: null },
      grant: expect.objectContaining({ vaultId: VAULT, entryId: ENTRY, agentId: AGENT, methods: 'Inject', fieldSelectionMode: 'all', grantEntry: { envelope: true } }),
    })
  })

  it('omits the grant when the approver disabled Agent access', async () => {
    await approveAsNewEntry({ submissionId: 's', vaultId: VAULT, label: 'L', payload: payload('new', { username: 'u', password: 'p' }) })
    expect(mocks.buildCanonicalGrantEnvelope).not.toHaveBeenCalled()
    expect(mocks.approveSubmissionAsNewEntry.mock.calls[0][1]).not.toHaveProperty('grant')
  })

  it('never submits material prepared by a session that locked meanwhile', async () => {
    mocks.sealEntryShareCopy.mockImplementation(async () => {
      mocks.privateKey = new Uint8Array(32).fill(9)
      return { entryKey: 'ek', memberIndex: 'mi', memberSecret: 'ms', agentDiscovery: null }
    })
    await expect(approveAsNewEntry({ submissionId: 's', vaultId: VAULT, label: 'L', payload: payload('new', { username: 'u', password: 'p' }) }))
      .rejects.toBeInstanceOf(SubmissionApprovalLockedError)
    expect(mocks.approveSubmissionAsNewEntry).not.toHaveBeenCalled()
  })
})

describe('secret byte preservation', () => {
  it('approve-new seals a precomposed secret unchanged and refuses a decomposed one before any request', async () => {
    await approveAsNewEntry({ submissionId: 's', vaultId: VAULT, label: 'L', payload: payload('new', { username: 'u', password: 'Caf\u00e9' }) })
    expect(mocks.sealEntryShareCopy.mock.calls[0][0].content.password).toBe('Caf\u00e9')
    vi.clearAllMocks()
    await expect(approveAsNewEntry({ submissionId: 's', vaultId: VAULT, label: 'L', payload: payload('new', { username: 'u', password: 'Cafe\u0301' }) }))
      .rejects.toMatchObject({ code: 'secret-not-nfc' })
    expect(mocks.issueEntryCreationChallenge).not.toHaveBeenCalled()
    expect(mocks.approveSubmissionAsNewEntry).not.toHaveBeenCalled()
  })
})

describe('approveAsUpdate', () => {
  const detail = { organizationId: ORG, vaultId: VAULT, id: ENTRY, currentRevision: '7', entryKey: 'k', memberSecret: 's' }

  beforeEach(() => {
    mocks.getCanonicalEntry.mockResolvedValue(detail)
    mocks.openMemberSecret.mockResolvedValue(currentSecret())
    mocks.prepareCanonicalEntryUpdate.mockImplementation(async (_vaultId: string, input: { nextCanonicalMemberSecret: MemberSecretV1 }) => ({
      material: { baseRevision: '7', memberSecret: 'next', grantEnvelopes: ['refreshed'] },
      nextSecret: input.nextCanonicalMemberSecret,
      nextRevision: '8',
      memberKeyGeneration: 4,
    }))
  })

  it('merges only the proposed fields into the exact expected revision and reuses the update producer', async () => {
    await approveAsUpdate({
      submissionId: 's', vaultId: VAULT, entryId: ENTRY, expectedEntryRevision: '7', agent,
      payload: payload('update', { password: 'new-pass' }),
    })
    const [, input, entryId] = mocks.prepareCanonicalEntryUpdate.mock.calls[0]
    const previous = currentSecret()
    expect(entryId).toBe(ENTRY)
    expect(input.previousCanonicalMemberSecret).toEqual(previous)
    expect(input.nextCanonicalMemberSecret).toEqual({ ...previous, content: { ...previous.content, password: 'new-pass' } })
    expect(mocks.buildCanonicalGrantEnvelope).toHaveBeenCalledWith(expect.objectContaining({ entryRevision: '8', approvedMethods: 4 }))
    expect(mocks.approveSubmissionAsUpdate).toHaveBeenCalledWith('s', {
      entry: { vaultId: VAULT, entryId: ENTRY, baseRevision: '7', memberSecret: 'next', grantEnvelopes: ['refreshed'] },
      grant: expect.objectContaining({ entryId: ENTRY, methods: 'Inject' }),
    })
  })

  it('keeps a precomposed new password unchanged and refuses a decomposed one', async () => {
    await approveAsUpdate({ submissionId: 's', vaultId: VAULT, entryId: ENTRY, expectedEntryRevision: '7', payload: payload('update', { password: 'Caf\u00e9' }) })
    expect(mocks.prepareCanonicalEntryUpdate.mock.calls[0][1].nextCanonicalMemberSecret.content.password).toBe('Caf\u00e9')
    await expect(approveAsUpdate({ submissionId: 's', vaultId: VAULT, entryId: ENTRY, expectedEntryRevision: '7', payload: payload('update', { password: 'Cafe\u0301' }) }))
      .rejects.toMatchObject({ code: 'secret-not-nfc' })
    expect(mocks.approveSubmissionAsUpdate).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['detail for another Vault', () => mocks.getCanonicalEntry.mockResolvedValue({ ...detail, vaultId: '1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e' })],
    ['detail for another Entry', () => mocks.getCanonicalEntry.mockResolvedValue({ ...detail, id: '1f1f1f1f-1f1f-4f1f-8f1f-1f1f1f1f1f1f' })],
    ['detail in another organization', () => mocks.getCanonicalEntry.mockResolvedValue({ ...detail, organizationId: '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a' })],
    ['Vault response for another Vault', () => mocks.getEncryptedVault.mockResolvedValueOnce({
      id: '1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e', organizationId: ORG, memberVaultKey: { wrappedVaultKey: { descriptor: { scope: {} } } } })],
    ['Vault response in another organization', () => mocks.getEncryptedVault.mockResolvedValueOnce({
      id: VAULT, organizationId: '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a', memberVaultKey: { wrappedVaultKey: { descriptor: { scope: {} } } } })],
  ])('binds the decrypted target to the signed target and JWT organization: refuses a %s', async (_name, arrange) => {
    arrange()
    await expect(approveAsUpdate({
      submissionId: 's', vaultId: VAULT, entryId: ENTRY, expectedEntryRevision: '7', payload: payload('update', { password: 'n' }),
    })).rejects.toThrow()
    expect(mocks.openVaultProjection).not.toHaveBeenCalled()
    expect(mocks.openMemberVaultKey).not.toHaveBeenCalled()
    expect(mocks.approveSubmissionAsUpdate).not.toHaveBeenCalled()
  })

  it('opens the target with the Member-bound Vault projection and reuses that Vault for the revision', async () => {
    await approveAsUpdate({ submissionId: 's', vaultId: VAULT, entryId: ENTRY, expectedEntryRevision: '7', payload: payload('update', { password: 'n' }) })
    expect(mocks.openVaultProjection).toHaveBeenCalledWith(expect.objectContaining({ id: VAULT }), mocks.privateKey, MEMBER)
    expect(mocks.prepareCanonicalEntryUpdate.mock.calls[0][1].vault).toMatchObject({ id: VAULT, organizationId: ORG })
  })

  it('stops before opening keys when the target moved past the expected revision', async () => {
    mocks.getCanonicalEntry.mockResolvedValue({ ...detail, currentRevision: '8' })
    await expect(approveAsUpdate({
      submissionId: 's', vaultId: VAULT, entryId: ENTRY, expectedEntryRevision: '7',
      payload: payload('update', { password: 'new-pass' }),
    })).rejects.toBeInstanceOf(StaleSubmissionTargetError)
    expect(mocks.openMemberVaultKey).not.toHaveBeenCalled()
    expect(mocks.approveSubmissionAsUpdate).not.toHaveBeenCalled()
  })

  it('rejects an update whose entry type differs from the decrypted target', async () => {
    await expect(approveAsUpdate({
      submissionId: 's', vaultId: VAULT, entryId: ENTRY, expectedEntryRevision: '7',
      payload: { ...payload('update', { value: 'k' }), identity: { submissionKind: 2, entryType: 0 } },
    })).rejects.toMatchObject({ code: 'entry-type-mismatch' })
    expect(mocks.approveSubmissionAsUpdate).not.toHaveBeenCalled()
  })
})
