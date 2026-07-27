import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createDefaultVaultMock, protocolMock } = vi.hoisted(() => ({
  createDefaultVaultMock: vi.fn<[unknown], Promise<void>>(),
  protocolMock: vi.fn(async () => ({ vaultId: 'vault-1', canonical: true })),
}))
vi.mock('../api/account-api', () => ({ createDefaultVault: createDefaultVaultMock, getAccount: vi.fn(async () => ({ memberKeyVersion: 2 })) }))
vi.mock('../api/client', () => ({ api: { post: vi.fn(() => ({ json: vi.fn(async () => ({ vaultId: 'vault-1' })) })) } }))
vi.mock('../crypto/create-vault-protocol', () => ({ createVaultProtocolPayload: protocolMock }))
vi.mock('../../features/auth', () => ({ useAuthStore: { getState: () => ({ accessToken: 'eyJhbGciOiJub25lIn0.eyJvcmdfaWQiOiJvcmctMSJ9.', userId: 'member-1' }) } }))

import { createDefaultVaultSafe } from './create-default-vault-safe'
const FAKE_KEY = new Uint8Array(32).fill(1)

describe('createDefaultVaultSafe', () => {
  beforeEach(() => { vi.clearAllMocks(); createDefaultVaultMock.mockResolvedValue(undefined) })
  it('builds and submits the canonical encrypted default Vault payload', async () => {
    await createDefaultVaultSafe(FAKE_KEY, 'Personal')
    expect(protocolMock).toHaveBeenCalledWith(expect.objectContaining({ vaultId: 'vault-1', organizationId: 'org-1', memberId: 'member-1', memberKeyVersion: 2, memberPrivateKey: FAKE_KEY,
      metadata: expect.objectContaining({ name: 'Personal', grantMode: 'granular' }) }))
    expect(createDefaultVaultMock).toHaveBeenCalledWith({ vaultId: 'vault-1', canonical: true })
  })
  it('resolves without throwing when the backend returns 409', async () => {
    createDefaultVaultMock.mockRejectedValueOnce(Object.assign(new Error('Conflict'), { response: { status: 409 } }))
    await expect(createDefaultVaultSafe(FAKE_KEY, 'Personal')).resolves.toBeUndefined()
  })
  it('resolves without throwing on any other error', async () => {
    createDefaultVaultMock.mockRejectedValueOnce(new Error('Network error'))
    await expect(createDefaultVaultSafe(FAKE_KEY, 'Personal')).resolves.toBeUndefined()
  })
})
