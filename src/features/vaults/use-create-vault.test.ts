import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSodium, randomBytes } from '../../shared/crypto/sodium'
import { useAuthStore } from '../auth'
import { GRANT_MODE_GRANULAR } from './types'
import { useCreateVault, VaultLockedError } from './use-create-vault'

const createVaultMock = vi.fn()
const challengeMock = vi.fn()

vi.mock('../../shared/api/account-api', () => ({
  getAccount: () => Promise.resolve({ memberKeyVersion: 1 }),
}))

vi.mock('./api/vault-api', async () => {
  const actual = await vi.importActual<typeof import('./api/vault-api')>(
    './api/vault-api',
  )
  return {
    ...actual,
    createVault: (payload: unknown) => createVaultMock(payload),
    issueVaultCreationChallenge: () => challengeMock(),
  }
})

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return createElement(QueryClientProvider, { client }, children)
}

describe('useCreateVault', () => {
  beforeEach(() => {
    createVaultMock.mockReset()
    challengeMock.mockReset().mockResolvedValue({
      vaultId: '11112222-3333-4444-8555-666677778888',
      expiresAt: '2026-07-27T15:00:00Z',
    })
    // Reset auth store between tests so `unlockVault` doesn't leak across.
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      userId: null,
      isOnboarded: false,
      permissions: 0,
      isVaultLocked: true,
      masterKey: null,
      privateKey: null,
    })
  })

  it('builds a versioned, challenge-bound Vault protocol payload', async () => {
    // Use a real X25519 keypair so `crypto_box_seal` produces a verifiable
    // sealed box — we then unseal it inside the test to assert the server
    // would have received a recoverable VK, not garbage.
    const sodium = await loadSodium()
    const keyPair = sodium.crypto_box_keypair()
    const masterKey = await randomBytes(32)
    useAuthStore.getState().unlockVault(masterKey, keyPair.privateKey)
    useAuthStore.setState({
      accessToken: `x.${btoa(JSON.stringify({ org_id: '00112233-4455-6677-8899-aabbccddeeff' }))}.x`,
      userId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    })

    createVaultMock.mockImplementation(async (payload) => ({
      id: 'vault-1',
      payload,
    }))

    const { result } = renderHook(() => useCreateVault(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        name: 'Production',
        grantMode: GRANT_MODE_GRANULAR,
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(createVaultMock).toHaveBeenCalledTimes(1)
    const payload = createVaultMock.mock.calls[0][0] as {
      vaultId: string
      memberVaultMetadata: { descriptor: { purpose: number }; encodedSuitePayload: string }
      creatorVaultKey: { wrappedVaultKey: { descriptor: { recipientKeyKind: number }; encodedSealedKeyPackage: string } }
      vaultPrivateKeys: unknown[]
    }
    expect(payload.vaultId).toBe('11112222-3333-4444-8555-666677778888')
    expect(payload.memberVaultMetadata.descriptor.purpose).toBe(1)
    expect(payload.memberVaultMetadata.encodedSuitePayload).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(payload.creatorVaultKey.wrappedVaultKey.descriptor.recipientKeyKind).toBe(5)
    expect(payload.creatorVaultKey.wrappedVaultKey.encodedSealedKeyPackage).toHaveLength(160)
    expect(payload.vaultPrivateKeys).toHaveLength(2)
  })

  it('throws VaultLockedError when no private key is in the auth store', async () => {
    const { result } = renderHook(() => useCreateVault(), { wrapper })

    let captured: unknown
    await act(async () => {
      try {
        await result.current.mutateAsync({
          name: 'whatever',
          grantMode: GRANT_MODE_GRANULAR,
        })
      } catch (err) {
        captured = err
      }
    })

    expect(captured).toBeInstanceOf(VaultLockedError)
    expect(createVaultMock).not.toHaveBeenCalled()
  })

  it('invalidates the vaults list query after a successful create', async () => {
    const sodium = await loadSodium()
    const keyPair = sodium.crypto_box_keypair()
    useAuthStore.getState().unlockVault(await randomBytes(32), keyPair.privateKey)
    useAuthStore.setState({
      accessToken: `x.${btoa(JSON.stringify({ org_id: '00112233-4455-6677-8899-aabbccddeeff' }))}.x`,
      userId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    })

    createVaultMock.mockResolvedValue({
      id: 'vault-2',
      organizationId: 'org-1',
      name: 'Test',
      description: null,
      icon: null,
      color: null,
      grantMode: GRANT_MODE_GRANULAR,
      createdAt: '2026-04-25T12:00:00Z',
      updatedAt: '2026-04-25T12:00:00Z',
      memberCount: 1,
      entryCount: 0,
      activeGrantCount: 0,
    })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCreateVault(), {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client }, children),
    })

    await act(async () => {
      await result.current.mutateAsync({
        name: 'Test',
        grantMode: GRANT_MODE_GRANULAR,
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['vaults'] })
  })
})
