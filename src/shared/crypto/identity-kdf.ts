import { argon2id } from 'hash-wasm'
import { decodeBase64Url, encodeUtf8 } from './vault-v2-bytes'
import { wipe } from './sodium'

export const IDENTITY_SECURITY_VERSION = 1
export const IDENTITY_KDF_PROFILE_ID = 'identity-argon2id-password-v1'
export const IDENTITY_KDF_SALT_BYTES = 16
export const IDENTITY_MAXIMUM_PASSWORD_UTF8_BYTES = 1_024

export const IDENTITY_KDF_PROFILE = Object.freeze({
  id: IDENTITY_KDF_PROFILE_ID,
  securityVersion: IDENTITY_SECURITY_VERSION,
  memoryKiB: 32_768,
  iterations: 2,
  parallelism: 1,
  outputBytes: 32,
})

export interface IdentityKdfMetadata {
  profileId: string
  securityVersion: number
  kdfSalt: string
  memoryKiB: number
  iterations: number
  parallelism: number
}

export interface IdentityKdfOutputs {
  authCredential: Uint8Array
  masterKey: Uint8Array
}

const AUTH_INFO = encodeUtf8('palladin/identity/password-v1/auth-credential')
const MASTER_KEY_INFO = encodeUtf8('palladin/identity/password-v1/master-key')

function accountIdBytes(accountId: string): Uint8Array {
  const hex = accountId.replaceAll('-', '')
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error('Identity account ID must be an RFC 4122 UUID')
  return new Uint8Array(hex.match(/../g)!.map((value) => Number.parseInt(value, 16)))
}

async function hkdfSha256(root: Uint8Array, salt: Uint8Array, info: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', new Uint8Array(root), 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(salt), info: new Uint8Array(info) }, cryptoKey, 256))
}

export function assertIdentityKdfProfile(metadata: IdentityKdfMetadata): void {
  const matches = metadata.profileId === IDENTITY_KDF_PROFILE.id
    && metadata.securityVersion === IDENTITY_KDF_PROFILE.securityVersion
    && metadata.memoryKiB === IDENTITY_KDF_PROFILE.memoryKiB
    && metadata.iterations === IDENTITY_KDF_PROFILE.iterations
    && metadata.parallelism === IDENTITY_KDF_PROFILE.parallelism
  if (!matches) throw new Error(metadata.securityVersion > IDENTITY_SECURITY_VERSION
    ? 'upgrade-required' : 'unsupported-kdf-profile')
  decodeBase64Url(metadata.kdfSalt, IDENTITY_KDF_SALT_BYTES)
}

export function generateIdentityAccountId(): string {
  return crypto.randomUUID()
}

export async function deriveIdentityOutputsFromRoot(
  accountRoot: Uint8Array,
  accountId: string,
  kdfSalt: Uint8Array,
): Promise<IdentityKdfOutputs> {
  if (accountRoot.length !== 32 || kdfSalt.length !== IDENTITY_KDF_SALT_BYTES) throw new Error('Invalid Identity KDF input length')
  const id = accountIdBytes(accountId)
  try {
    const [authCredential, masterKey] = await Promise.all([
      hkdfSha256(accountRoot, id, AUTH_INFO),
      hkdfSha256(accountRoot, id, MASTER_KEY_INFO),
    ])
    return { authCredential, masterKey }
  } finally {
    wipe(id)
  }
}

export async function deriveIdentityV1(
  password: string,
  accountId: string,
  kdfSalt: Uint8Array,
): Promise<IdentityKdfOutputs> {
  if (kdfSalt.length !== IDENTITY_KDF_SALT_BYTES) {
    throw new Error('Invalid Identity KDF input length')
  }
  const passwordBytes = encodeUtf8(password)
  if (passwordBytes.length > IDENTITY_MAXIMUM_PASSWORD_UTF8_BYTES) {
    wipe(passwordBytes)
    throw new Error('password-too-long')
  }
  let accountRoot: Uint8Array | undefined
  try {
    accountRoot = await argon2id({
      password: passwordBytes,
      salt: kdfSalt,
      parallelism: IDENTITY_KDF_PROFILE.parallelism,
      iterations: IDENTITY_KDF_PROFILE.iterations,
      memorySize: IDENTITY_KDF_PROFILE.memoryKiB,
      hashLength: IDENTITY_KDF_PROFILE.outputBytes,
      outputType: 'binary',
    })
    return deriveIdentityOutputsFromRoot(accountRoot, accountId, kdfSalt)
  } finally {
    wipe(passwordBytes)
    if (accountRoot) wipe(accountRoot)
  }
}
