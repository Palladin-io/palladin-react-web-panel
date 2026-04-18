import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveKey, RECOVERY_KEY_SALT_BYTES } from '../../shared/crypto/argon2'
import { toBase64 } from '../../shared/crypto/encoding'
import { encryptWithKey, randomBytes } from '../../shared/crypto/sodium'
import { generateRecoveryMnemonic, joinMnemonic } from '../../shared/lib/mnemonic'
import { InvalidRecoveryKeyError, useRecover } from './use-recover'

const getAccountMock = vi.fn()
const recoverAccountMock = vi.fn()

vi.mock('../../shared/api/account-api', async () => {
  const actual = await vi.importActual<typeof import('../../shared/api/account-api')>(
    '../../shared/api/account-api',
  )
  return {
    ...actual,
    getAccount: () => getAccountMock(),
    recoverAccount: (payload: unknown) => recoverAccountMock(payload),
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
    recoverySalt: toBase64(recoverySalt),
    encryptedPrivateKeyByRecovery: toBase64(blob),
    fakePrivateKey,
  }
}

describe('useRecover', () => {
  beforeEach(() => {
    getAccountMock.mockReset()
    recoverAccountMock.mockReset()
  })

  it('posts re-wrapped keys and returns a fresh 24-word mnemonic on success', async () => {
    const mnemonic = generateRecoveryMnemonic()
    const { recoverySalt, encryptedPrivateKeyByRecovery } = await buildFakeAccount(mnemonic)

    getAccountMock.mockResolvedValue({ recoverySalt, encryptedPrivateKeyByRecovery })
    recoverAccountMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useRecover(), { wrapper })

    let returned: string[] | undefined
    await act(async () => {
      returned = await result.current.mutateAsync({
        recoveryMnemonic: mnemonic,
        newPassword: 'correct-horse-battery-staple',
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(returned).toHaveLength(24)
    expect(recoverAccountMock).toHaveBeenCalledTimes(1)

    const payload = recoverAccountMock.mock.calls[0][0]
    expect(payload).toEqual(
      expect.objectContaining({
        newSalt: expect.any(String),
        newEncryptedPrivateKey: expect.any(String),
        newRecoverySalt: expect.any(String),
        newEncryptedPrivateKeyByRecovery: expect.any(String),
      }),
    )
  })

  it('throws InvalidRecoveryKeyError when the mnemonic does not unwrap the server blob', async () => {
    const realMnemonic = generateRecoveryMnemonic()
    const { recoverySalt, encryptedPrivateKeyByRecovery } = await buildFakeAccount(realMnemonic)

    getAccountMock.mockResolvedValue({ recoverySalt, encryptedPrivateKeyByRecovery })

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
})
