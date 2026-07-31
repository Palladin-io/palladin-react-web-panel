import { decodeBase64Url } from './vault-v2-bytes'
import { decryptVaultEnvelope, openVaultProtocolPackage } from './vault-v2-envelope'
import type { VaultEnvelopeHeader } from './vault-v2-protocol'
import { vaultKeyFingerprint } from './vault-v2-rotation'
import { loadSodium, wipe } from './sodium'

export interface EncryptedReasonEnvelope {
  [key: string]: unknown
  organizationId: string
  vaultId: string
  entryId: string
  grantRequestId: string
  agentId: string
  requestRevision: string
  header: VaultEnvelopeHeader
  reasonKeyVersion: number
  agentMessageKeyVersion: number
  recipientAgentMessageKeyFingerprint: string
  requestedMethods: number
  ciphertext: string
  agentMessageWrappedReasonDek: string
  agentSignature: string
}

export async function decryptEncryptedReason(
  envelope: EncryptedReasonEnvelope,
  agentMessagePrivateKey: Uint8Array,
): Promise<string> {
  if (agentMessagePrivateKey.length !== 32) throw new Error('Agent Message private key must be 32 bytes')
  const sodium = await loadSodium()
  const publicKey = sodium.crypto_scalarmult_base(agentMessagePrivateKey)
  let reasonDek: Uint8Array | undefined
  let plaintext: Uint8Array | undefined
  try {
    const fingerprint = await vaultKeyFingerprint(publicKey, 4)
    if (fingerprint !== envelope.recipientAgentMessageKeyFingerprint) {
      throw new Error('Encrypted reason recipient fingerprint mismatch')
    }
    reasonDek = await openVaultProtocolPackage(
      decodeBase64Url(envelope.agentMessageWrappedReasonDek),
      publicKey,
      agentMessagePrivateKey,
    )
    if (reasonDek.length !== 32) throw new Error('ReasonDEK must be 32 bytes')
    plaintext = await decryptVaultEnvelope('encrypted-reason', envelope, reasonDek, {
      aadContext: envelope,
      minimumMemberKeyGeneration: envelope.header.memberKeyGeneration,
    })
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || Object.keys(parsed).length !== 1 || typeof (parsed as { reason?: unknown }).reason !== 'string') {
      throw new Error('Encrypted reason plaintext is invalid')
    }
    const reason = (parsed as { reason: string }).reason.normalize('NFC').trim()
    if (reason.length === 0 || new TextEncoder().encode(reason).length > 4_096) {
      throw new Error('Encrypted reason plaintext exceeds protocol limits')
    }
    return reason
  } finally {
    wipe(publicKey)
    if (reasonDek) wipe(reasonDek)
    if (plaintext) wipe(plaintext)
  }
}
