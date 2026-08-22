import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResponse } from '../../../shared/api/types'
import { StaleAuthenticatedSessionError } from '../session/session-boundary'
import { useAuthStore } from '../stores/auth-store'
import { useChangeMasterPassword } from './use-change-master-password'

const mocks = vi.hoisted(() => ({
  getAccountForSession: vi.fn(),
  changeMasterPassword: vi.fn(),
  assertIdentityKdfProfile: vi.fn(),
  deriveIdentityV1: vi.fn(),
  decryptWithKey: vi.fn(),
  encryptWithKey: vi.fn(),
  randomBytes: vi.fn(),
  wipe: vi.fn(),
}))

vi.mock('../../../shared/api/account-api', () => ({
  ACCOUNT_QUERY_KEY: ['account'],
  getAccountForSession: mocks.getAccountForSession,
  changeMasterPassword: mocks.changeMasterPassword,
}))
vi.mock('../../../shared/crypto/identity-kdf', () => ({
  assertIdentityKdfProfile: mocks.assertIdentityKdfProfile,
  deriveIdentityV1: mocks.deriveIdentityV1,
  IDENTITY_KDF_PROFILE: {
    securityVersion: 1,
    memoryKiB: 65536,
    iterations: 3,
    parallelism: 1,
  },
  IDENTITY_KDF_PROFILE_ID: 'identity-argon2id-password-v1',
  IDENTITY_KDF_SALT_BYTES: 16,
}))
vi.mock('../../../shared/crypto/vault-v2-bytes', () => ({
  decodeBase64Url: () => new Uint8Array(32).fill(4),
  encodeBase64Url: () => 'encoded',
}))
vi.mock('../../../shared/crypto/sodium', () => ({
  decryptWithKey: mocks.decryptWithKey,
  encryptWithKey: mocks.encryptWithKey,
  randomBytes: mocks.randomBytes,
  wipe: mocks.wipe,
}))

function jwt(userId: string, organizationId: string): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replaceAll('=', '')
  return `${encode({ alg: 'none' })}.${encode({ sub: userId, org_id: organizationId })}.signature`
}

function session(userId: string, organizationId: string): AuthResponse {
  return {
    accessToken: jwt(userId, organizationId),
    refreshToken: `refresh-${userId}-${organizationId}`,
    userId,
    isOnboarded: true,
    emailVerified: true,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })}>
      {children}
    </QueryClientProvider>
  )
}

describe('useChangeMasterPassword request ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.getState().logout()
    useAuthStore.getState().setTokens(session('user-a', 'org-a'))
    mocks.getAccountForSession.mockResolvedValue({
      userId: 'user-a',
      encryptedPrivateKey: 'encrypted-private-key',
      kdf: {
        securityVersion: 1,
        minimumSecurityVersion: 1,
        profileId: 'identity-argon2id-password-v1',
        kdfSalt: 'salt',
        credentialRevision: 2,
        privateKeyWrapRevision: 3,
        deviceWrapperMetadata: null,
      },
    })
    mocks.deriveIdentityV1
      .mockResolvedValueOnce({
        authCredential: new Uint8Array(32).fill(1),
        masterKey: new Uint8Array(32).fill(2),
      })
      .mockResolvedValueOnce({
        authCredential: new Uint8Array(32).fill(3),
        masterKey: new Uint8Array(32).fill(4),
      })
    mocks.randomBytes.mockResolvedValue(new Uint8Array(16).fill(5))
    mocks.decryptWithKey.mockResolvedValue(new Uint8Array(32).fill(6))
    mocks.changeMasterPassword.mockResolvedValue(undefined)
  })

  it('does not send A-derived password material after switching to B before the final request', async () => {
    let releaseEncryption!: (value: Uint8Array) => void
    mocks.encryptWithKey.mockImplementationOnce(() => new Promise<Uint8Array>((resolve) => {
      releaseEncryption = resolve
    }))
    const { result } = renderHook(() => useChangeMasterPassword(), { wrapper })

    const execution = result.current.mutateAsync({
      currentPassword: 'old password',
      newPassword: 'new password',
    })
    await waitFor(() => expect(mocks.encryptWithKey).toHaveBeenCalledOnce())
    useAuthStore.getState().logout()
    useAuthStore.getState().setTokens(session('user-b', 'org-b'))
    releaseEncryption(new Uint8Array(48).fill(7))

    await expect(execution).rejects.toBeInstanceOf(StaleAuthenticatedSessionError)
    expect(mocks.changeMasterPassword).not.toHaveBeenCalled()
    expect(useAuthStore.getState().userId).toBe('user-b')
  })
})
