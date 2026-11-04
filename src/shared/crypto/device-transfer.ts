import {
  computePairingSas,
  encodePairingQr,
  generatePairingKeyPair,
  openPairingEnvelope,
  pairingRecipientKeyDigest,
  PairingError,
  sealAccountSecretForPairing,
  type PairingEnvelope,
  type PairingKeyPair,
} from '@palladin/crypto'
import { toBase64Url } from './encoding'
import { wipe } from './sodium'
import { decodeBase64Url, decodeUuid } from './vault-v2-bytes'

/**
 * identity-kdf v3 device pairing (Secret Key transfer). The backend relays
 * only the public key, the challenge and the sealed envelope; the user's SAS
 * comparison authenticates the relayed key. The pairing private key is memory-only.
 */
export { PairingError }
export type { PairingEnvelope, PairingKeyPair }

/** `transferId` is the backend UUID; the pairing encodings carry its 16 network-order bytes. */
export interface TransferSession {
  accountId: string
  transferId: string
  challenge: string
  recipientPublicKey: Uint8Array
}

export const createTransferKeyPair = generatePairingKeyPair

function wireTransferId(transferId: string): string {
  try {
    return toBase64Url(decodeUuid(transferId.toLowerCase()))
  } catch {
    throw new PairingError('malformed-envelope')
  }
}

function wireSession<T extends { transferId: string }>(session: T): T {
  return { ...session, transferId: wireTransferId(session.transferId) }
}

export function wipeTransferKeyPair(keyPair: PairingKeyPair | null | undefined): void {
  if (keyPair) wipe(keyPair.privateKey)
}

export function encodeTransferPublicKey(publicKey: Uint8Array): string {
  return toBase64Url(publicKey)
}

/** Decodes the relayed recipient key; the SAS, not this decoding, authenticates it. */
export function decodeTransferPublicKey(value: string): Uint8Array {
  try {
    return decodeBase64Url(value, 1216)
  } catch {
    throw new PairingError('recipient-key-digest-mismatch')
  }
}

export function recipientTransferQr(transferId: string, recipientPublicKey: Uint8Array): string {
  return encodePairingQr({
    flow: 'recipient-shows-qr',
    transferId: wireTransferId(transferId),
    recipientPublicKeyDigest: pairingRecipientKeyDigest(recipientPublicKey),
  })
}

export function senderTransferQr(transferId: string, challenge: string): string {
  return encodePairingQr({ flow: 'sender-shows-qr', transferId: wireTransferId(transferId), challenge })
}

export function transferSas(session: TransferSession): string {
  return computePairingSas(wireSession(session))
}

/** Sender, `sender-shows-qr`: seals only after the user confirmed both devices show the same SAS. */
export async function sealSecretKeyForTransfer(
  session: TransferSession,
  sasConfirmed: boolean,
  secretKey: Uint8Array,
): Promise<PairingEnvelope> {
  if (!sasConfirmed) throw new PairingError('sas-not-confirmed')
  return sealAccountSecretForPairing({ ...wireSession(session), flow: 'sender-shows-qr', sasConfirmed: true }, secretKey)
}

/** Recipient: the session values are the ones this browser created, never echoed by the claim response. */
export function openTransferEnvelope(
  session: Omit<TransferSession, 'recipientPublicKey'>,
  keyPair: PairingKeyPair,
  envelope: PairingEnvelope,
): Promise<Uint8Array> {
  return openPairingEnvelope(wireSession(session), keyPair, envelope)
}
