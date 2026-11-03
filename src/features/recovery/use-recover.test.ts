import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { HTTPError } from 'ky'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth/stores/auth-store'
import { deriveKey, RECOVERY_KEY_SALT_BYTES } from '../../shared/crypto/argon2'
import { concatBytes, decodeUuid, encodeBase64Url } from '../../shared/crypto/vault-v2-bytes'
import { derivePublicKey, encryptWithKey, loadSodium, randomBytes } from '../../shared/crypto/sodium'
import { generateRecoveryMnemonic, joinMnemonic } from '../../shared/lib/mnemonic'
import {
  InvalidRecoveryKeyError,
  RecoveryProofInvalidError,
  useRecover,
  type RecoverResult,
} from './use-recover'

const getAccountMock = vi.fn()
const recoverAccountMock = vi.fn()
const issueRecoveryChallengeMock = vi.fn()

const SESSION_USER_ID = '00112233-4455-4677-8899-aabbccddeeff'
const OTHER_USER_ID = 'ffeeddcc-bbaa-4988-8766-554433221100'

vi.mock('../../shared/api/account-api', async () => {
  const actual = await vi.importActual<typeof import('../../shared/api/account-api')>(
    '../../shared/api/account-api',
  )
  return {
    ...actual,
    getAccount: () => getAccountMock(),
    recoverAccount: (payload: unknown) => recoverAccountMock(payload),
    issueRecoveryChallenge: () => issueRecoveryChallengeMock(),
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

async function sealChallenge(privateKey: Uint8Array, userId: string, secret: Uint8Array) {
  const sodium = await loadSodium()
  const plaintext = concatBytes(new TextEncoder().encode('PLDNRCV1'), decodeUuid(userId), secret)
  return {
    sealedChallenge: encodeBase64Url(sodium.crypto_box_seal(plaintext, await derivePublicKey(privateKey))),
    expiresAt: '2026-10-29T12:00:00Z',
  }
}

async function recoverWith(mnemonic: string[]) {
  const { result } = renderHook(() => useRecover(), { wrapper })
  let returned: RecoverResult | undefined
  let captured: unknown
  await act(async () => {
    try {
      returned = await result.current.mutateAsync({
        recoveryMnemonic: mnemonic,
        newPassword: 'correct-horse-battery-staple',
      })
    } catch (err) {
      captured = err
    }
  })
  return { returned, captured }
}

async function mockRecoverableAccount(accountUserId = SESSION_USER_ID) {
  const mnemonic = generateRecoveryMnemonic()
  const account = await buildFakeAccount(mnemonic)
  getAccountMock.mockResolvedValue({
    userId: accountUserId,
    recoverySalt: account.recoverySalt,
    encryptedPrivateKeyByRecovery: account.encryptedPrivateKeyByRecovery,
    kdf: { credentialRevision: 1, privateKeyWrapRevision: 2 },
  })
  return { mnemonic, privateKey: account.fakePrivateKey }
}

describe('useRecover', () => {
  beforeEach(() => {
    getAccountMock.mockReset()
    recoverAccountMock.mockReset()
    issueRecoveryChallengeMock.mockReset()
    useAuthStore.setState({ userId: SESSION_USER_ID })
  })

  it('posts re-wrapped keys with the opened recovery proof and returns a fresh mnemonic', async () => {
    const { mnemonic, privateKey } = await mockRecoverableAccount()
    const secret = await randomBytes(32)
    issueRecoveryChallengeMock.mockResolvedValue(await sealChallenge(privateKey, SESSION_USER_ID, secret))
    recoverAccountMock.mockResolvedValue(undefined)

    const { returned, captured } = await recoverWith(mnemonic)

    expect(captured).toBeUndefined()
    expect(returned?.recoveryMnemonic).toHaveLength(24)
    expect(issueRecoveryChallengeMock).toHaveBeenCalledTimes(1)
    expect(recoverAccountMock).toHaveBeenCalledTimes(1)

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
        recoveryProof: encodeBase64Url(secret),
      }),
    )
  })

  it('rejects a challenge addressed to another user without sending the recovery', async () => {
    const { mnemonic, privateKey } = await mockRecoverableAccount()
    issueRecoveryChallengeMock.mockResolvedValue(
      await sealChallenge(privateKey, OTHER_USER_ID, await randomBytes(32)),
    )

    const { captured } = await recoverWith(mnemonic)

    expect(captured).toBeInstanceOf(Error)
    expect(recoverAccountMock).not.toHaveBeenCalled()
  })

  it('binds the challenge to the session user, not the account response', async () => {
    const { mnemonic, privateKey } = await mockRecoverableAccount(OTHER_USER_ID)
    issueRecoveryChallengeMock.mockResolvedValue(
      await sealChallenge(privateKey, OTHER_USER_ID, await randomBytes(32)),
    )

    const { captured } = await recoverWith(mnemonic)

    expect(captured).toBeInstanceOf(Error)
    expect(recoverAccountMock).not.toHaveBeenCalled()
  })

  it('rejects a challenge with a wrong length without sending the recovery', async () => {
    const { mnemonic } = await mockRecoverableAccount()
    issueRecoveryChallengeMock.mockResolvedValue({
      sealedChallenge: encodeBase64Url(await randomBytes(103)),
      expiresAt: '2026-10-29T12:00:00Z',
    })

    const { captured } = await recoverWith(mnemonic)

    expect(captured).toBeInstanceOf(Error)
    expect(recoverAccountMock).not.toHaveBeenCalled()
  })

  it('surfaces RecoveryProofInvalidError when the backend rejects the proof', async () => {
    const { mnemonic, privateKey } = await mockRecoverableAccount()
    issueRecoveryChallengeMock.mockResolvedValue(
      await sealChallenge(privateKey, SESSION_USER_ID, await randomBytes(32)),
    )
    recoverAccountMock.mockRejectedValue(new HTTPError(
      new Response(JSON.stringify({ errors: { generalErrors: ['errors.backend.recovery-proof-invalid'] } }), { status: 403 }),
      new Request('https://api.example.test/api/account/recovery'),
      {} as never,
    ))

    const { captured } = await recoverWith(mnemonic)

    expect(captured).toBeInstanceOf(RecoveryProofInvalidError)
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
})
