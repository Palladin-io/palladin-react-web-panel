import { api } from '../../../shared/api/client'

/** Authenticated sender side of identity-kdf v3 device pairing (`sender-shows-qr`). */
export interface SenderTransferSession {
  transferId: string
  challenge: string
  expiresAt: string
}

export interface SenderTransferState {
  challenge: string
  /** Attached by the recipient; base64url X-Wing public key. */
  recipientPublicKey: string | null
  state: string
}

export function createSenderTransfer(): Promise<SenderTransferSession> {
  return api.post('api/account/secret-key-transfers', { retry: 0 }).json<SenderTransferSession>()
}

export function getSenderTransfer(transferId: string): Promise<SenderTransferState> {
  return api.get(`api/account/secret-key-transfers/${encodeURIComponent(transferId)}`, { retry: 0 })
    .json<SenderTransferState>()
}

export async function deliverSenderTransfer(
  transferId: string,
  envelope: { kemCiphertext: string; ciphertext: string },
): Promise<void> {
  await api.post(`api/account/secret-key-transfers/${encodeURIComponent(transferId)}/envelope`, {
    json: envelope, retry: 0,
  })
}

export async function cancelSenderTransfer(transferId: string): Promise<void> {
  await api.delete(`api/account/secret-key-transfers/${encodeURIComponent(transferId)}`, {
    retry: 0, throwHttpErrors: false,
  })
}
