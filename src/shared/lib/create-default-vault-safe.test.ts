import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mocks must be hoisted before the module under test is imported.
const createDefaultVaultMock = vi.hoisted(() => vi.fn<[unknown, unknown?], Promise<void>>())
const createPayloadMock = vi.hoisted(() => vi.fn())
const challengeMock = vi.hoisted(() => vi.fn(async () => ({ vaultId: 'vault-1' })))

vi.mock('../crypto/create-vault-protocol', () => ({ createVaultProtocolPayload: createPayloadMock }))
vi.mock('./jwt', () => ({ parseJwtPayload: () => ({ org_id: 'org-1' }) }))
vi.mock('../../features/vaults/api/vault-api', () => ({ issueVaultCreationChallenge: challengeMock }))
const testSession = {
  accessToken: 'token',
  refreshToken: 'refresh',
  userId: 'member-1',
  organizationId: 'org-1',
  sessionGeneration: 1,
  sessionBoundaryActive: false,
}
vi.mock('../../features/auth/session/session-boundary', () => ({
  captureAuthenticatedSession: () => testSession,
  authenticatedSessionMatches: () => true,
}))

vi.mock('../api/account-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/account-api')>()
  return {
    ...actual,
    createDefaultVault: createDefaultVaultMock,
    getAccountForSession: vi.fn(async () => ({ memberKeyVersion: 3 })),
  }
})

import { createDefaultVaultSafe } from './create-default-vault-safe'

const FAKE_KEY = new Uint8Array(32).fill(1)
const PAYLOAD = { vaultId: 'vault-1', canonical: true }

describe('createDefaultVaultSafe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createPayloadMock.mockResolvedValue(PAYLOAD)
    createDefaultVaultMock.mockResolvedValue(undefined)
  })

  it('creates the default Vault with the canonical protocol-v2 payload', async () => {
    await expect(createDefaultVaultSafe(FAKE_KEY, 'Personal')).resolves.toBe('created')

    expect(createPayloadMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1', vaultId: 'vault-1', memberId: 'member-1',
      memberKeyVersion: 3, memberPrivateKey: FAKE_KEY,
      metadata: expect.objectContaining({ name: 'Personal', grantMode: 'granular' }),
    }))
    expect(createDefaultVaultMock).toHaveBeenCalledOnce()
    expect(createDefaultVaultMock).toHaveBeenCalledWith(PAYLOAD, testSession)
  })

  it('resolves without throwing when the backend returns 409 (already exists)', async () => {
    // Simulate the HTTPError ky throws for a 409 response.
    const conflict = Object.assign(new Error('Conflict'), {
      response: { status: 409 },
    })
    createDefaultVaultMock.mockRejectedValueOnce(conflict)

    await expect(createDefaultVaultSafe(FAKE_KEY, 'Personal')).resolves.toBe('already-exists')
  })

  it('returns false without throwing on a retryable failure', async () => {
    createDefaultVaultMock.mockRejectedValueOnce(new Error('Network error'))

    await expect(createDefaultVaultSafe(FAKE_KEY, 'Personal')).resolves.toBe('failed')
  })
})
