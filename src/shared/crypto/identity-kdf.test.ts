import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllGlobals())
import { decodeBase64Url, encodeBase64Url } from './vault-v2-bytes'
import {
  assertIdentityKdfProfile,
  deriveIdentityV1,
  IDENTITY_KDF_PROFILE,
  IDENTITY_KDF_PROFILE_ID,
  IDENTITY_SECURITY_VERSION,
} from './identity-kdf'
import { wipe } from './sodium'

const vector = {
  password: 'Pąssw🔐rd-密碼-v1',
  accountId: '00112233-4455-4677-8899-aabbccddeeff',
  kdfSalt: 'AAECAwQFBgcICQoLDA0ODw',
  accountRoot: '5NWVu_9TkyrsWRtZhENZzDYTeSUcLnMYIFGBzv_8_eg',
  authCredential: 'aRKTmLFcaSbzQy83MTRpf5PfLSjeBLGQP4HVpEudV7I',
  masterKey: 'HtGyf-Z7BvE39e66VcP2bztQ0BBKmfzvBGCp_nLiXbk',
}

describe('Identity password KDF v1', () => {
  it.each(['secure', 'http'])('matches the frozen backend vector byte-for-byte on %s', async transport => {
    if (transport === 'http') vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    const salt = decodeBase64Url(vector.kdfSalt, 16)
    const result = await deriveIdentityV1(vector.password, vector.accountId, salt)
    try {
      expect(encodeBase64Url(result.authCredential)).toBe(vector.authCredential)
      expect(encodeBase64Url(result.masterKey)).toBe(vector.masterKey)
    } finally {
      wipe(salt)
      wipe(result.authCredential)
      wipe(result.masterKey)
    }
  })

  it('accepts only the frozen password-only profile', () => {
    expect(() => assertIdentityKdfProfile({
      profileId: IDENTITY_KDF_PROFILE_ID,
      securityVersion: IDENTITY_SECURITY_VERSION,
      kdfSalt: vector.kdfSalt,
      memoryKiB: IDENTITY_KDF_PROFILE.memoryKiB,
      iterations: IDENTITY_KDF_PROFILE.iterations,
      parallelism: IDENTITY_KDF_PROFILE.parallelism,
    })).not.toThrow()
    expect(() => assertIdentityKdfProfile({
      profileId: 'identity-argon2id-password-v3',
      securityVersion: 3,
      kdfSalt: vector.kdfSalt,
      memoryKiB: IDENTITY_KDF_PROFILE.memoryKiB,
      iterations: IDENTITY_KDF_PROFILE.iterations,
      parallelism: IDENTITY_KDF_PROFILE.parallelism,
    })).toThrow('upgrade-required')
  })

  it('rejects passwords above the UTF-8 byte limit', async () => {
    await expect(deriveIdentityV1(
      'ą'.repeat(513),
      vector.accountId,
      new Uint8Array(16),
    )).rejects.toThrow('password-too-long')
  })
})
