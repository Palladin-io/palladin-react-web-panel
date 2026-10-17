import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mocks must be hoisted before the module under test is imported.
const createDefaultVaultMock = vi.hoisted(() => vi.fn<[unknown], Promise<void>>())
const createPayloadMock = vi.hoisted(() => vi.fn())
const challengeMock = vi.hoisted(() => vi.fn(async () => ({ vaultId: 'vault-1' })))
const auth = vi.hoisted(() => ({ userId: 'member-1', accessToken: 'token', privateKey: null as Uint8Array | null,
  isVaultLocked: false, emailVerified: true, cryptoSessionGeneration: 1, permissions: 8 }))

vi.mock('../crypto/create-vault-protocol', () => ({ createVaultProtocolPayload: createPayloadMock }))
vi.mock('./jwt', () => ({ parseJwtPayload: (token: string) => ({ org_id: token === 'other' ? 'org-2' : 'org-1' }) }))
vi.mock('../../features/vaults/api/vault-api', () => ({ issueVaultCreationChallenge: challengeMock }))
vi.mock('../../features/auth', () => ({
  useAuthStore: { getState: () => ({ ...auth }) },
}))

vi.mock('../api/account-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/account-api')>()
  return { ...actual, createDefaultVault: createDefaultVaultMock, getAccount: vi.fn(async () => ({ memberKeyVersion: 3 })) }
})

import { createDefaultVaultSafe } from './create-default-vault-safe'

const FAKE_KEY = new Uint8Array(32).fill(1)
const PAYLOAD = { vaultId: 'vault-1', canonical: true }

describe('createDefaultVaultSafe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(auth, { userId: 'member-1', accessToken: 'token', privateKey: FAKE_KEY,
      isVaultLocked: false, emailVerified: true, cryptoSessionGeneration: 1, permissions: 8 })
    createPayloadMock.mockResolvedValue(PAYLOAD)
    createDefaultVaultMock.mockResolvedValue(undefined)
  })

  it.each(['lock', 'account', 'organization', 'permission', 'key', 'abort'] as const)(
    'never posts prepared material after %s during encryption', async (change) => {
      let complete!: (value: unknown) => void
      let entered!: () => void
      const sealing = new Promise<void>((resolve) => { entered = resolve })
      createPayloadMock.mockImplementationOnce(() => { entered(); return new Promise((resolve) => { complete = resolve }) })
      const controller = new AbortController()
      const pending = createDefaultVaultSafe(FAKE_KEY, 'Personal', controller.signal)
      await sealing
      if (change === 'lock') auth.isVaultLocked = true
      else if (change === 'account') auth.userId = 'another-member'
      else if (change === 'organization') auth.accessToken = 'other'
      else if (change === 'permission') auth.permissions = 0
      else if (change === 'key') auth.privateKey = new Uint8Array(32)
      else controller.abort()
      complete(PAYLOAD)
      await expect(pending).resolves.toBe('failed')
      expect(createDefaultVaultMock).not.toHaveBeenCalled()
    },
  )

  it('does not treat a challenge conflict as an existing default Vault', async () => {
    challengeMock.mockRejectedValueOnce({ response: { status: 409 } })
    await expect(createDefaultVaultSafe(FAKE_KEY, 'Personal')).resolves.toBe('failed')
    expect(createDefaultVaultMock).not.toHaveBeenCalled()
  })

  it('creates the default Vault with the canonical protocol-v2 payload', async () => {
    await expect(createDefaultVaultSafe(FAKE_KEY, 'Personal')).resolves.toBe('created')

    expect(createPayloadMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1', vaultId: 'vault-1', memberId: 'member-1',
      memberKeyVersion: 3, memberPrivateKey: FAKE_KEY,
      metadata: expect.objectContaining({ name: 'Personal', grantMode: 'granular' }),
    }))
    expect(createDefaultVaultMock).toHaveBeenCalledOnce()
    expect(createDefaultVaultMock).toHaveBeenCalledWith(PAYLOAD, undefined)
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
