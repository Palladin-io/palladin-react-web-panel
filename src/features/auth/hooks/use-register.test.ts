import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveKey } from '../../../shared/crypto/argon2'
import { fromBase64, toBase64 } from '../../../shared/crypto/encoding'
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
    })

    expect(registerMock).toHaveBeenCalledTimes(1)
    const payload = registerMock.mock.calls[0][0] as RegisterPayload

    // Shape: crypto material + auth credential + profile.
    expect(payload.email).toBe('user@example.com')
    expect(payload.displayName).toBe('user')
    for (const field of [
      'authHash',
      'authSalt',
      'salt',
      'recoverySalt',
      'publicKey',
      'encryptedPrivateKey',
      'encryptedPrivateKeyByRecovery',
    ] as const) {
      expect(payload[field], field).toBeTruthy()
    }

    // The auth salt and the master-key salt are independent.
    expect(payload.authSalt).not.toBe(payload.salt)

    // The plaintext password must never appear anywhere on the wire.
    expect(JSON.stringify(payload)).not.toContain(PASSWORD)

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
    })
    const payload = registerMock.mock.calls[0][0] as RegisterPayload
    const sodium = await loadSodium()

    // authHash on the wire == Argon2id(password, authSalt) — reproducible by the server-side login path.
    const recomputedAuthHash = await deriveKey(PASSWORD, fromBase64(payload.authSalt))
    expect(toBase64(recomputedAuthHash)).toBe(payload.authHash)

    // MK derived from the same password unwraps the private key, whose public
    // half matches the published public key.
    const mk = await deriveKey(PASSWORD, fromBase64(payload.salt))
    const privateKey = await decryptWithKey(fromBase64(payload.encryptedPrivateKey), mk)
    const derivedPub = sodium.crypto_scalarmult_base(privateKey)
    expect(Array.from(derivedPub)).toEqual(Array.from(fromBase64(payload.publicKey)))

    // The recovery wrapping unwraps the same private key.
    const rk = await deriveKey(MNEMONIC.join(' '), fromBase64(payload.recoverySalt))
    const viaRecovery = await decryptWithKey(
      fromBase64(payload.encryptedPrivateKeyByRecovery),
      rk,
    )
    expect(Array.from(viaRecovery)).toEqual(Array.from(privateKey))
  })
})
