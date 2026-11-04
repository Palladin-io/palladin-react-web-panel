import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveRecipientPublicKey, deriveIdentityV2, KEY_WRAPPER_SUITE, parseSecretKey } from '@palladin/crypto'
import { deriveKey } from '../../../shared/crypto/argon2'
import { decodeBase64Url, encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { decryptWithKey } from '../../../shared/crypto/sodium'
import type { RegisterPayload } from '../api/auth-api'
import { useRegister } from './use-register'

const revokeMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const registerMock = vi.hoisted(() => vi.fn())
const setTokensMock = vi.hoisted(() => vi.fn())
const unlockVaultMock = vi.hoisted(() => vi.fn())
const storeSecretMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('../api/auth-api', () => ({ register: registerMock, revokeUninstalledLoginSession: revokeMock }))
vi.mock('../../../shared/crypto/secret-key', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../shared/crypto/secret-key')>(),
  storeDeviceSecretKey: storeSecretMock,
}))
vi.mock('../../../shared/lib/create-default-vault-safe', () => ({
  createDefaultVaultSafe: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({
      setTokens: setTokensMock,
      unlockVault: unlockVaultMock,
      privateKey: new Uint8Array(32).fill(7),
    }),
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client }, children)
}

const PASSWORD = 'correct horse battery staple'
const MNEMONIC = Array.from({ length: 24 }, (_, i) => `word${i}`)

describe('useRegister', () => {
  beforeEach(() => {
    registerMock.mockReset().mockResolvedValue({
      accessToken: 'a',
      sessionId: 'r',
      userId: 'u',
      isOnboarded: true,
      emailVerified: false,
    })
    setTokensMock.mockReset()
    unlockVaultMock.mockReset()
    storeSecretMock.mockClear()
  })

  it('posts an authHash + auth material and never leaks the password or master key', async () => {
    const { result } = renderHook(() => useRegister(), { wrapper })
    await result.current.mutateAsync({
      email: 'user@example.com',
      masterPassword: PASSWORD,
      recoveryMnemonic: MNEMONIC,
    })

    expect(registerMock).toHaveBeenCalledTimes(1)
    const payload = registerMock.mock.calls[0][0] as RegisterPayload

    // Shape: crypto material + auth credential + profile.
    expect(payload.email).toBe('user@example.com')
    expect(payload.displayName).toBe('user')
    expect(payload.securityVersion).toBe(2)
    expect(payload.kdfProfileId).toBe('identity-argon2id-account-secret-v2')
    expect(payload.publicKeySuiteId).toBe(KEY_WRAPPER_SUITE.active)
    expect(decodeBase64Url(payload.publicKey, 2048)).toHaveLength(1216)
    for (const field of [
      'accountId',
      'authCredential',
      'kdfSalt',
      'recoverySalt',
      'publicKey',
      'encryptedPrivateKey',
      'encryptedPrivateKeyByRecovery',
    ] as const) {
      expect(payload[field], field).toBeTruthy()
    }

    // The plaintext password must never appear anywhere on the wire.
    expect(JSON.stringify(payload)).not.toContain(PASSWORD)

    // Session is established and the vault is unlocked in-memory.
    expect(setTokensMock).toHaveBeenCalledOnce()
    expect(unlockVaultMock).toHaveBeenCalledOnce()
    expect(unlockVaultMock.mock.calls[0][3]).toBe(KEY_WRAPPER_SUITE.active)
  })

  it('produces a decryptable bundle bound to the Secret Key it stores and returns for the kit', async () => {
    const { result } = renderHook(() => useRegister(), { wrapper })
    const kit = await result.current.mutateAsync({
      email: 'user@example.com',
      masterPassword: PASSWORD,
      recoveryMnemonic: MNEMONIC,
    })
    const payload = registerMock.mock.calls[0][0] as RegisterPayload
    expect(storeSecretMock).toHaveBeenCalledOnce()
    const [storedAccountId, storedSecret] = storeSecretMock.mock.calls[0] as [string, Uint8Array]
    expect(storedAccountId).toBe(payload.accountId)
    // The stored buffer is wiped after use; the kit string carries the same key.
    const secret = parseSecretKey(payload.accountId, kit.secretKey)
    expect(kit.email).toBe('user@example.com')
    expect(kit.qrPayload.startsWith('palladin-kit:v1:')).toBe(true)
    expect(JSON.stringify(payload)).not.toContain(kit.secretKey)
    expect(storedSecret).toHaveLength(32)

    const identity = await deriveIdentityV2(PASSWORD, secret, payload.accountId, decodeBase64Url(payload.kdfSalt, 16))
    expect(encodeBase64Url(identity.authCredential)).toBe(payload.authCredential)

    const privateKey = await decryptWithKey(decodeBase64Url(payload.encryptedPrivateKey), identity.masterKey)
    const derivedPublic = await deriveRecipientPublicKey(KEY_WRAPPER_SUITE.active, privateKey)
    expect(encodeBase64Url(derivedPublic)).toBe(payload.publicKey)

    const rk = await deriveKey(MNEMONIC.join(' '), decodeBase64Url(payload.recoverySalt))
    const viaRecovery = await decryptWithKey(decodeBase64Url(payload.encryptedPrivateKeyByRecovery), rk)
    expect(Array.from(viaRecovery)).toEqual(Array.from(privateKey))
  })
  it('revokes a late registration session after the form unmounts without publishing keys', async () => {
    let respond!: (value: object) => void
    registerMock.mockImplementation(() => new Promise(resolve => { respond = resolve }))
    const { result, unmount } = renderHook(() => useRegister(), { wrapper })
    const pending = result.current.mutateAsync({ email: 'user@example.com', masterPassword: PASSWORD, recoveryMnemonic: MNEMONIC })
    const rejected = expect(pending).rejects.toThrow('cancelled')
    await vi.waitFor(() => expect(registerMock).toHaveBeenCalledOnce())
    unmount()
    respond({ accessToken: 'issued-access', sessionId: 'issued-session', userId: 'u', isOnboarded: true })
    await rejected
    expect(setTokensMock).not.toHaveBeenCalled()
    expect(unlockVaultMock).not.toHaveBeenCalled()
    expect(revokeMock).toHaveBeenCalledWith('issued-access')
  })

})
