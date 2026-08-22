import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveKey, RECOVERY_KEY_SALT_BYTES } from '../../shared/crypto/argon2'
import { encodeBase64Url } from '../../shared/crypto/vault-v2-bytes'
import { encryptWithKey, randomBytes } from '../../shared/crypto/sodium'
import { generateRecoveryMnemonic, joinMnemonic } from '../../shared/lib/mnemonic'
import type { AuthResponse } from '../../shared/api/types'
import {
  authenticatedSessionMatches,
  captureAuthenticatedSession,
  StaleAuthenticatedSessionError,
} from '../auth/session/session-boundary'
import { useAuthStore } from '../auth/stores/auth-store'
import { InvalidRecoveryKeyError, useRecover, type RecoverResult } from './use-recover'

const getAccountMock = vi.fn()
const recoverAccountMock = vi.fn()

vi.mock('../../shared/api/account-api', async () => {
  const actual = await vi.importActual<typeof import('../../shared/api/account-api')>(
    '../../shared/api/account-api',
  )
  return {
    ...actual,
    getAccountForSession: (session: unknown) => getAccountMock(session),
    recoverAccount: (payload: unknown, session: unknown) => recoverAccountMock(payload, session),
  }
})

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return createElement(QueryClientProvider, { client }, children)
}

async function buildFakeAccount(mnemonic: string[]) {
  // Produce a real encrypted-private-key-by-recovery blob so the hook can
  // decrypt it for real. Using real crypto here keeps the test end-to-end
  // for everything except the HTTP layer.
  const recoverySalt = await randomBytes(RECOVERY_KEY_SALT_BYTES)
  const recoveryKey = await deriveKey(joinMnemonic(mnemonic), recoverySalt)
  const fakePrivateKey = await randomBytes(32)
  const blob = await encryptWithKey(fakePrivateKey, recoveryKey)
  return {
    recoverySalt: encodeBase64Url(recoverySalt),
    encryptedPrivateKeyByRecovery: encodeBase64Url(blob),
    fakePrivateKey,
  }
}

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

describe('useRecover', () => {
  beforeEach(() => {
    getAccountMock.mockReset()
    recoverAccountMock.mockReset()
    useAuthStore.getState().logout()
    useAuthStore.getState().setTokens(session('user-a', 'org-a'))
  })

  it('posts re-wrapped keys and returns a fresh 24-word mnemonic on success', async () => {
    const mnemonic = generateRecoveryMnemonic()
    const { recoverySalt, encryptedPrivateKeyByRecovery } = await buildFakeAccount(mnemonic)

    getAccountMock.mockResolvedValue({
      userId: '00112233-4455-4677-8899-aabbccddeeff',
      recoverySalt,
      encryptedPrivateKeyByRecovery,
      kdf: { credentialRevision: 1, privateKeyWrapRevision: 2 },
    })
    recoverAccountMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useRecover(), { wrapper })

    let returned: RecoverResult | undefined
    await act(async () => {
      returned = await result.current.mutateAsync({
        recoveryMnemonic: mnemonic,
        newPassword: 'correct-horse-battery-staple',
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(returned?.recoveryMnemonic).toHaveLength(24)
    expect(recoverAccountMock).toHaveBeenCalledTimes(1)
    expect(recoverAccountMock.mock.calls[0][1]).toEqual(captureAuthenticatedSession())

    const payload = recoverAccountMock.mock.calls[0][0]
    expect(payload).toEqual(
      expect.objectContaining({
        securityVersion: 1,
        kdfProfileId: 'identity-argon2id-password-v1',
        newKdfSalt: expect.any(String),
        newAuthCredential: expect.any(String),
        newEncryptedPrivateKey: expect.any(String),
        newRecoverySalt: expect.any(String),
        newEncryptedPrivateKeyByRecovery: expect.any(String),
      }),
    )
  })

  it('throws InvalidRecoveryKeyError when the mnemonic does not unwrap the server blob', async () => {
    const realMnemonic = generateRecoveryMnemonic()
    const { recoverySalt, encryptedPrivateKeyByRecovery } = await buildFakeAccount(realMnemonic)

    getAccountMock.mockResolvedValue({
      userId: '00112233-4455-4677-8899-aabbccddeeff',
      recoverySalt,
      encryptedPrivateKeyByRecovery,
      kdf: { credentialRevision: 1, privateKeyWrapRevision: 2 },
    })

    const { result } = renderHook(() => useRecover(), { wrapper })

    const wrongMnemonic = generateRecoveryMnemonic()

    let captured: unknown
    await act(async () => {
      try {
        await result.current.mutateAsync({
          recoveryMnemonic: wrongMnemonic,
          newPassword: 'whatever',
        })
      } catch (err) {
        captured = err
      }
    })

    expect(captured).toBeInstanceOf(InvalidRecoveryKeyError)
    expect(recoverAccountMock).not.toHaveBeenCalled()
  })

  it('surfaces a plain Error when the account lacks recovery material', async () => {
    getAccountMock.mockResolvedValue({})

    const { result } = renderHook(() => useRecover(), { wrapper })

    let captured: unknown
    await act(async () => {
      try {
        await result.current.mutateAsync({
          recoveryMnemonic: generateRecoveryMnemonic(),
          newPassword: 'whatever',
        })
      } catch (err) {
        captured = err
      }
    })

    expect(captured).toBeInstanceOf(Error)
    expect((captured as Error).message).toMatch(/missing recovery material/i)
    expect(recoverAccountMock).not.toHaveBeenCalled()
  })

  it('does not send A-derived recovery material after the session switches to B', async () => {
    const mnemonic = generateRecoveryMnemonic()
    const { recoverySalt, encryptedPrivateKeyByRecovery } = await buildFakeAccount(mnemonic)
    let releaseAccount!: (account: unknown) => void
    getAccountMock.mockImplementationOnce(() => new Promise((resolve) => {
      releaseAccount = resolve
    }))
    const { result } = renderHook(() => useRecover(), { wrapper })

    const execution = result.current.mutateAsync({
      recoveryMnemonic: mnemonic,
      newPassword: 'correct-horse-battery-staple',
    })
    await waitFor(() => expect(getAccountMock).toHaveBeenCalledOnce())
    useAuthStore.getState().logout()
    useAuthStore.getState().setTokens(session('user-b', 'org-b'))
    releaseAccount({
      userId: '00112233-4455-4677-8899-aabbccddeeff',
      recoverySalt,
      encryptedPrivateKeyByRecovery,
      kdf: { credentialRevision: 1, privateKeyWrapRevision: 2 },
    })

    await expect(execution).rejects.toBeInstanceOf(StaleAuthenticatedSessionError)
    expect(authenticatedSessionMatches(captureAuthenticatedSession())).toBe(true)
    expect(recoverAccountMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState().userId).toBe('user-b')
  })
})
