import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSubmissionPayload } from '../../shared/crypto/agent-submission'
import { openMemberSecret } from '../../shared/crypto/entry-protocol'
import { defaultAgentVisibilityPolicy, toMemberSecret } from '../../shared/crypto/entry-draft'

const ORG = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a'
const OTHER_ORG = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a'
const VAULT = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e'
const OTHER_VAULT = '1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e'
const ENTRY = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f'
const MEMBER = '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c'

const mocks = vi.hoisted(() => ({
  vaultKey: new Uint8Array(32).fill(0x31),
  privateKey: new Uint8Array(32).fill(7),
  approve: vi.fn(),
  openVaultProjection: vi.fn(),
  vault: null as unknown,
}))

function token(org: string) {
  return `h.${Buffer.from(JSON.stringify({ org_id: org })).toString('base64url')}.s`
}

vi.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ privateKey: mocks.privateKey, accessToken: token(ORG), userId: MEMBER }) },
}))
vi.mock('../vaults/api/vault-api', () => ({ issueEntryCreationChallenge: async () => ({ entryId: ENTRY }), getCanonicalEntry: vi.fn() }))
vi.mock('../vaults/sync/member-sync-api', () => ({ getEncryptedVault: async () => mocks.vault }))
vi.mock('../vaults/use-update-canonical-entry', () => ({ prepareCanonicalEntryUpdate: vi.fn() }))
vi.mock('../../shared/crypto/vault-protocol', () => ({
  openMemberVaultKey: async () => new Uint8Array(mocks.vaultKey),
  openVaultProjection: mocks.openVaultProjection,
  openVaultDerivedEnvelope: async () => new Uint8Array(32).fill(0x32),
}))
vi.mock('./api/submissions-api', () => ({ approveSubmissionAsNewEntry: mocks.approve, approveSubmissionAsUpdate: vi.fn() }))

import { approveAsNewEntry } from './submission-approval'

/** An internally consistent encrypted Vault response for the given coordinates. */
function vaultFor(vaultId: string, organizationId: string) {
  const scope = { organizationId, vaultId }
  return {
    id: vaultId, organizationId, memberKeyGeneration: 4,
    currentKeyEpoch: { vaultKeyVersion: 2, vdkVersion: 3 },
    memberVaultKey: { wrappedVaultKey: { descriptor: { scope: { ...scope, memberId: MEMBER }, wrappedKeyVersion: 2 } } },
    memberVaultMetadata: { descriptor: { scope, keyVersion: 2, memberKeyGeneration: 4 } },
    discoveryKey: { descriptor: { scope, purpose: 2, keyVersion: 3, memberKeyGeneration: 4, binding: { wrappingVaultKeyVersion: 2 } } },
  }
}

const payload: AgentSubmissionPayload = {
  schema: 'palladin.agent-submission-payload.v1', identity: { submissionKind: 1, entryType: 1 }, label: 'Agent label',
  content: { username: 'u@example.invalid', password: 'p-secret', url: 'https://site.example.invalid/login' },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.vault = vaultFor(VAULT, ORG)
  mocks.openVaultProjection.mockImplementation(async () => ({ vaultKey: new Uint8Array(mocks.vaultKey) }))
  mocks.approve.mockResolvedValue({})
})

describe('approve-new encryption', () => {
  it('seals the approved secret under the selected Vault key so only that key opens it', async () => {
    await approveAsNewEntry({ submissionId: 's', vaultId: VAULT, label: 'Approved', payload })
    expect(mocks.openVaultProjection).toHaveBeenCalledWith(mocks.vault, mocks.privateKey, MEMBER)
    const { entry } = mocks.approve.mock.calls[0][1]
    expect(JSON.stringify(entry)).not.toContain('p-secret')
    const coordinates = { organizationId: ORG, vaultId: VAULT, entryId: ENTRY, revision: '1' }
    const opened = await openMemberSecret(entry.entryKey, entry.memberSecret, new Uint8Array(mocks.vaultKey), coordinates)
    expect(opened).toEqual(toMemberSecret({
      label: 'Approved', agentLabel: 'Approved', type: 1, policy: defaultAgentVisibilityPolicy(1),
      payload: { type: 1, username: 'u@example.invalid', password: 'p-secret', url: 'https://site.example.invalid/login', fields: [] },
    }))
    await expect(openMemberSecret(entry.entryKey, entry.memberSecret, new Uint8Array(32).fill(0x99), coordinates)).rejects.toThrow()
    await expect(openMemberSecret(entry.entryKey, entry.memberSecret, new Uint8Array(mocks.vaultKey),
      { ...coordinates, vaultId: OTHER_VAULT })).rejects.toThrow()
  })

  it.each([
    ['another Vault', () => vaultFor(OTHER_VAULT, ORG)],
    ['another organization', () => vaultFor(VAULT, OTHER_ORG)],
  ])('refuses a consistent Vault response for %s before opening keys or sending anything', async (_name, build) => {
    mocks.vault = build()
    await expect(approveAsNewEntry({ submissionId: 's', vaultId: VAULT, label: 'Approved', payload })).rejects.toThrow()
    expect(mocks.openVaultProjection).not.toHaveBeenCalled()
    expect(mocks.approve).not.toHaveBeenCalled()
  })

  it('refuses a Member Vault-key wrapper for another principal', async () => {
    const vault = vaultFor(VAULT, ORG)
    vault.memberVaultKey.wrappedVaultKey.descriptor.scope.memberId = '2c2c2c2c-2c2c-4c2c-8c2c-2c2c2c2c2c2c'
    mocks.vault = vault
    const { openVaultProjection } = await vi.importActual<typeof import('../../shared/crypto/vault-protocol')>('../../shared/crypto/vault-protocol')
    mocks.openVaultProjection.mockImplementation(openVaultProjection)
    await expect(approveAsNewEntry({ submissionId: 's', vaultId: VAULT, label: 'Approved', payload })).rejects.toThrow()
    expect(mocks.approve).not.toHaveBeenCalled()
  })
})
