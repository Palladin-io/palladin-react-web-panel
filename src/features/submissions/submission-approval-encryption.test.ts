import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSubmissionPayload } from '../../shared/crypto/agent-submission'
import { openMemberSecret } from '../../shared/crypto/entry-protocol'
import { defaultAgentVisibilityPolicy, toMemberSecret } from '../../shared/crypto/entry-draft'

const ORG = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a'
const VAULT = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e'
const ENTRY = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f'

const mocks = vi.hoisted(() => ({
  vaultKey: new Uint8Array(32).fill(0x31),
  privateKey: new Uint8Array(32).fill(7),
  approve: vi.fn(),
  openMemberVaultKey: vi.fn(),
}))

vi.mock('../auth', () => ({ useAuthStore: { getState: () => ({ privateKey: mocks.privateKey }) } }))
vi.mock('../vaults/api/vault-api', () => ({ issueEntryCreationChallenge: async () => ({ entryId: ENTRY }), getCanonicalEntry: vi.fn() }))
vi.mock('../vaults/sync/member-sync-api', () => ({
  getEncryptedVault: async (vaultId: string) => ({
    id: vaultId, memberVaultKey: { wrappedVaultKey: { descriptor: { scope: { organizationId: ORG } } } },
    discoveryKey: {}, currentKeyEpoch: { vaultKeyVersion: 2, vdkVersion: 3 }, memberKeyGeneration: 4,
  }),
}))
vi.mock('../vaults/use-update-canonical-entry', () => ({ prepareCanonicalEntryUpdate: vi.fn() }))
vi.mock('../../shared/crypto/vault-protocol', () => ({
  openMemberVaultKey: mocks.openMemberVaultKey,
  openVaultDerivedEnvelope: async () => new Uint8Array(32).fill(0x32),
}))
vi.mock('./api/submissions-api', () => ({ approveSubmissionAsNewEntry: mocks.approve, approveSubmissionAsUpdate: vi.fn() }))

import { approveAsNewEntry } from './submission-approval'

beforeEach(() => {
  mocks.openMemberVaultKey.mockImplementation(async () => new Uint8Array(mocks.vaultKey))
  mocks.approve.mockResolvedValue({})
})

describe('approve-new encryption', () => {
  it('seals the approved secret under the selected Vault key so only that key opens it', async () => {
    const payload: AgentSubmissionPayload = {
      schema: 'palladin.agent-submission-payload.v1', identity: { submissionKind: 1, entryType: 1 }, label: 'Agent label',
      content: { username: 'u@example.invalid', password: 'p-secret', url: 'https://site.example.invalid/login' },
    }
    await approveAsNewEntry({ submissionId: 's', vaultId: VAULT, label: 'Approved', payload })
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
      { ...coordinates, vaultId: '1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e' })).rejects.toThrow()
  })
})
