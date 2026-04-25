import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fromBase64 } from '../../shared/crypto/encoding'
import { loadSodium, randomBytes } from '../../shared/crypto/sodium'
import { useAuthStore } from '../auth'
import { GRANT_MODE_GRANULAR } from './types'
import { useCreateVault, VaultLockedError } from './use-create-vault'

const createVaultMock = vi.fn()

vi.mock('./api/vault-api', async () => {
  const actual = await vi.importActual<typeof import('./api/vault-api')>(
    './api/vault-api',
  )
  return {
    ...actual,
    createVault: (payload: unknown) => createVaultMock(payload),
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

  it('seals a fresh VK to the user pubkey and posts a base64 wrappedVK', async () => {
    // Use a real X25519 keypair so `crypto_box_seal` produces a verifiable
    // sealed box — we then unseal it inside the test to assert the server
    // would have received a recoverable VK, not garbage.
    const sodium = await loadSodium()
    const keyPair = sodium.crypto_box_keypair()
    const masterKey = await randomBytes(32)
    useAuthStore.getState().unlockVault(masterKey, keyPair.privateKey)

    createVaultMock.mockImplementation(async (payload) => ({
      id: 'vault-1',
      organizationId: 'org-1',
      name: payload.name,
      description: payload.description ?? null,
      icon: payload.icon ?? null,
      color: payload.color ?? null,
      grantMode: payload.grantMode,
      createdAt: '2026-04-25T12:00:00Z',
      updatedAt: '2026-04-25T12:00:00Z',
      memberCount: 1,
      entryCount: 0,
      activeGrantCount: 0,
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
      name: string
      grantMode: number
      wrappedVK: string
    }
    expect(payload.name).toBe('Production')
    expect(payload.grantMode).toBe(GRANT_MODE_GRANULAR)
    expect(typeof payload.wrappedVK).toBe('string')

    // Round-trip the sealed box to confirm we wrapped a real 32-byte key
    // for the right recipient. If the seal targeted the wrong pubkey or
    // the VK length drifted, this would throw.
    const cipher = fromBase64(payload.wrappedVK)
    const unsealed = sodium.crypto_box_seal_open(
      cipher,
      keyPair.publicKey,
      keyPair.privateKey,
    )
    expect(unsealed.length).toBe(32)
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
