import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mocks must be hoisted before the module under test is imported.
const sealVaultKeyMock = vi.hoisted(() => vi.fn<[Uint8Array], Promise<string>>())
const createDefaultVaultMock = vi.hoisted(() => vi.fn<[unknown], Promise<void>>())

vi.mock('../crypto/vault-key', () => ({
  sealVaultKey: sealVaultKeyMock,
}))

vi.mock('../api/account-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/account-api')>()
  return { ...actual, createDefaultVault: createDefaultVaultMock }
})

import { createDefaultVaultSafe } from './create-default-vault-safe'

const FAKE_KEY = new Uint8Array(32).fill(1)
const SEALED_VK = 'sealed-vk-base64=='

describe('createDefaultVaultSafe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sealVaultKeyMock.mockResolvedValue(SEALED_VK)
    createDefaultVaultMock.mockResolvedValue(undefined)
  })

  it('seals the VK and calls createDefaultVault with the correct payload', async () => {
    await createDefaultVaultSafe(FAKE_KEY, 'Personal')

    expect(sealVaultKeyMock).toHaveBeenCalledOnce()
    expect(sealVaultKeyMock).toHaveBeenCalledWith(FAKE_KEY)

    expect(createDefaultVaultMock).toHaveBeenCalledOnce()
    expect(createDefaultVaultMock).toHaveBeenCalledWith({
      name: 'Personal',
      icon: 'shield',
      color: '#EB4747',
      grantMode: 2,
      wrappedVK: SEALED_VK,
    })
  })

  it('resolves without throwing when the backend returns 409 (already exists)', async () => {
    // Simulate the HTTPError ky throws for a 409 response.
    const conflict = Object.assign(new Error('Conflict'), {
      response: { status: 409 },
    })
    createDefaultVaultMock.mockRejectedValueOnce(conflict)

    await expect(createDefaultVaultSafe(FAKE_KEY, 'Personal')).resolves.toBeUndefined()
  })

  it('resolves without throwing on any other error (non-fatal)', async () => {
    createDefaultVaultMock.mockRejectedValueOnce(new Error('Network error'))

    await expect(createDefaultVaultSafe(FAKE_KEY, 'Personal')).resolves.toBeUndefined()
  })
})
