import { describe, expect, it } from 'vitest'
import { decodeBase64Url, encodeBase64Url } from './vault-v2-bytes'
import { assertIdentityKdfProfile, deriveIdentityOutputsFromRoot, deriveIdentityV2,
  IDENTITY_KDF_PROFILE, type IdentityKdfMetadata } from './identity-kdf'
import { wipe } from './sodium'

const vector = {
  password: 'Pālladin 🔐',
  accountSecret: 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA',
  accountId: '00112233-4455-6677-8899-aabbccddeeff',
  kdfSalt: 'oKGio6SlpqeoqaqrrK2urw',
  syntheticRoot: 'QEFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaW1xdXl8',
  authCredential: 'GfluE1P0DH4qBYvrGx8brXYLcWd-vkER1h3Pwbn5LgI',
  masterKey: '-H5RzHzdhlwaNS-KDaUgeHWhH-DODMBcZYeN2pUqc2k',
}

function metadata(overrides: Partial<IdentityKdfMetadata> = {}): IdentityKdfMetadata {
  return { ...IDENTITY_KDF_PROFILE, kdfSalt: vector.kdfSalt, ...overrides }
}

describe('Identity KDF v2', () => {
  it('reproduces the frozen output-domain vector byte-for-byte', async () => {
    const root = decodeBase64Url(vector.syntheticRoot, 32)
    const salt = decodeBase64Url(vector.kdfSalt, 16)
    const result = await deriveIdentityOutputsFromRoot(root, vector.accountId, salt)
    try {
      expect(encodeBase64Url(result.authCredential)).toBe(vector.authCredential)
      expect(encodeBase64Url(result.masterKey)).toBe(vector.masterKey)
    } finally { wipe(root); wipe(salt); wipe(result.authCredential); wipe(result.masterKey) }
  })

  it('runs the registered Argon2id profile once and domain-separates both outputs', async () => {
    const secret = decodeBase64Url(vector.accountSecret, 32)
    const salt = decodeBase64Url(vector.kdfSalt, 16)
    const result = await deriveIdentityV2(vector.password, secret, vector.accountId, salt)
    try {
      expect(result.authCredential).toHaveLength(32)
      expect(result.masterKey).toHaveLength(32)
      expect(result.authCredential).not.toEqual(result.masterKey)
    } finally { wipe(secret); wipe(salt); wipe(result.authCredential); wipe(result.masterKey) }
  })

  it.each([
    { memoryKiB: 19_456 }, { iterations: 1 }, { parallelism: 4 },
    { profileId: 'unknown' }, { securityVersion: 3 }, { accountSecretRequired: false },
  ])('rejects an unregistered server profile before derivation: %o', (override) => {
    expect(() => assertIdentityKdfProfile(metadata(override))).toThrow()
  })

  it('rejects passwords above the byte limit before Argon2 allocation', async () => {
    const secret = new Uint8Array(32)
    const salt = new Uint8Array(16)
    await expect(deriveIdentityV2('ą'.repeat(513), secret, vector.accountId, salt)).rejects.toThrow('password-too-long')
  })
})
