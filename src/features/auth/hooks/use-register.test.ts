import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveKey } from '../../../shared/crypto/argon2'
import { deriveIdentityV2 } from '../../../shared/crypto/identity-kdf'
import { decodeBase64Url, encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { decryptWithKey, loadSodium } from '../../../shared/crypto/sodium'
import type { RegisterPayload } from '../api/auth-api'
import { useRegister } from './use-register'

const registerMock = vi.hoisted(() => vi.fn())
const setTokensMock = vi.hoisted(() => vi.fn())
const unlockVaultMock = vi.hoisted(() => vi.fn())

vi.mock('../api/auth-api', () => ({ register: registerMock }))
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
const ACCOUNT_SECRET = Uint8Array.from({ length: 32 }, (_, index) => index + 1)

describe('useRegister', () => {
  beforeEach(() => {
    registerMock.mockReset().mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      userId: 'u',
      isOnboarded: true,
      emailVerified: false,
    })
    setTokensMock.mockReset()
    unlockVaultMock.mockReset()
  })

  it('posts an authHash + auth material and never leaks the password or master key', async () => {
    const { result } = renderHook(() => useRegister(), { wrapper })
    await result.current.mutateAsync({
      email: 'user@example.com',
      masterPassword: PASSWORD,
      recoveryMnemonic: MNEMONIC,
      accountSecret: ACCOUNT_SECRET,
    })

    expect(registerMock).toHaveBeenCalledTimes(1)
    const payload = registerMock.mock.calls[0][0] as RegisterPayload

    // Shape: crypto material + auth credential + profile.
    expect(payload.email).toBe('user@example.com')
    expect(payload.displayName).toBe('user')
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
    expect(JSON.stringify(payload)).not.toContain(encodeBase64Url(ACCOUNT_SECRET))

    // Session is established and the vault is unlocked in-memory.
    expect(setTokensMock).toHaveBeenCalledOnce()
    expect(unlockVaultMock).toHaveBeenCalledOnce()
  })

  it('produces a decryptable, self-consistent key bundle', async () => {
    const { result } = renderHook(() => useRegister(), { wrapper })
    await result.current.mutateAsync({
      email: 'user@example.com',
      masterPassword: PASSWORD,
      recoveryMnemonic: MNEMONIC,
      accountSecret: ACCOUNT_SECRET,
    })
    const payload = registerMock.mock.calls[0][0] as RegisterPayload
    const sodium = await loadSodium()

    const kdfSalt = decodeBase64Url(payload.kdfSalt, 16)
    const identity = await deriveIdentityV2(
      PASSWORD,
      ACCOUNT_SECRET,
      payload.accountId,
      kdfSalt,
    )
    expect(encodeBase64Url(identity.authCredential)).toBe(payload.authCredential)

    // MK derived from the same password unwraps the private key, whose public
    // half matches the published public key.
    const privateKey = await decryptWithKey(
      decodeBase64Url(payload.encryptedPrivateKey),
      identity.masterKey,
    )
    const derivedPub = sodium.crypto_scalarmult_base(privateKey)
    expect(Array.from(derivedPub)).toEqual(Array.from(decodeBase64Url(payload.publicKey)))

    // The recovery wrapping unwraps the same private key.
    const rk = await deriveKey(MNEMONIC.join(' '), decodeBase64Url(payload.recoverySalt))
    const viaRecovery = await decryptWithKey(
      decodeBase64Url(payload.encryptedPrivateKeyByRecovery),
      rk,
    )
    expect(Array.from(viaRecovery)).toEqual(Array.from(privateKey))
  })
})
