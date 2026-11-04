import { encodeKeyWrapperContext, KEY_WRAPPER_SUITE, openKey, sha256Digest } from '@palladin/crypto'
import { toBase64Url } from '../shared/crypto/encoding'
import { loadSodium } from '../shared/crypto/sodium'
import { concatBytes, encodeU16, encodeUtf8 } from '../shared/crypto/vault-v2-bytes'

/**
 * Test-only access to the read-only `palladin-x25519-sealed-box-v1` suite: the
 * frozen vectors and pre-migration fixtures still carry legacy packages, and
 * production code can no longer seal them.
 */
export const X25519_SEALED_BOX_V1 = KEY_WRAPPER_SUITE.legacy

export const VAULT_KEY_KIND = {
  agentX25519: 1,
  agentEd25519: 2,
  vaultSigningEd25519: 3,
  vaultMessageX25519: 4,
  memberX25519: 5,
  approverX25519: 6,
  approverEd25519: 7,
} as const

export const WRAPPER_PURPOSE = {
  memberVaultKey: 1,
  agentVaultDiscoveryKey: 2,
  reasonDek: 3,
  grantDek: 4,
  agentVaultKey: 5,
  scriptExecutionDek: 6,
  submissionDek: 7,
  approverMessagePrivateKey: 8,
  approverSigningSeed: 9,
} as const

export interface X25519WrapperContext {
  protocolVersion: number
  wrapperSuiteId: string
  purpose: number
  organizationId: string
  vaultId?: string
  entryId?: string
  grantOrRequestId?: string
  agentId?: string
  memberId?: string
  resourceRevision: number | bigint
  wrappedKeyVersion: number
  memberKeyGeneration?: number
  recipientKeyKind: number
  recipientKeyVersion: number
  recipientFingerprint: Uint8Array
  parentDescriptorHash?: Uint8Array
}

/** Legacy `PLDNV2FP` fingerprint (also used for vault-v2 Ed25519 key kinds). */
export async function computeVaultKeyFingerprint(publicKey: Uint8Array, keyKind: number): Promise<Uint8Array> {
  return sha256Digest(concatBytes(encodeUtf8('PLDNV2FP'), encodeU16(2), encodeU16(keyKind), publicKey))
}

function descriptorOf(context: X25519WrapperContext) {
  return {
    protocolVersion: context.protocolVersion,
    wrapperSuiteId: context.wrapperSuiteId,
    purpose: context.purpose,
    scope: {
      organizationId: context.organizationId, vaultId: context.vaultId ?? null, entryId: context.entryId ?? null,
      grantOrRequestId: context.grantOrRequestId ?? null, agentId: context.agentId ?? null, memberId: context.memberId ?? null,
    },
    resourceRevision: context.resourceRevision.toString(),
    wrappedKeyVersion: context.wrappedKeyVersion,
    memberKeyGeneration: context.memberKeyGeneration ?? null,
    recipientKeyKind: context.recipientKeyKind,
    recipientKeyVersion: context.recipientKeyVersion,
    recipientFingerprint: toBase64Url(context.recipientFingerprint),
    parentDescriptorHash: context.parentDescriptorHash ? toBase64Url(context.parentDescriptorHash) : null,
  }
}

export function encodeX25519WrapperContext(context: X25519WrapperContext): Uint8Array {
  return encodeKeyWrapperContext(descriptorOf(context))
}

export async function openKeyFromX25519Recipient(
  sealedPackage: Uint8Array,
  recipientPublicKey: Uint8Array,
  recipientPrivateKey: Uint8Array,
  context: X25519WrapperContext,
): Promise<Uint8Array> {
  return openKey(descriptorOf(context), toBase64Url(sealedPackage), {
    keySuiteId: context.wrapperSuiteId, keyKind: context.recipientKeyKind, keyVersion: context.recipientKeyVersion,
    publicKey: recipientPublicKey, privateKey: recipientPrivateKey,
  })
}

/** Builds a legacy package the way pre-migration clients did; for fixtures only. */
export async function sealKeyToX25519Recipient(
  key: Uint8Array,
  recipientPublicKey: Uint8Array,
  context: X25519WrapperContext,
): Promise<Uint8Array> {
  const sodium = await loadSodium()
  const contextHash = sha256Digest(concatBytes(encodeUtf8('PLDNX2CTX'), encodeX25519WrapperContext(context)))
  return sodium.crypto_box_seal(concatBytes(encodeUtf8('PLDNX2K1'), key, contextHash), recipientPublicKey)
}
