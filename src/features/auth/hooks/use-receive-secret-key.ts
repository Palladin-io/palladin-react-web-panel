import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createTransferKeyPair,
  encodeTransferPublicKey,
  openTransferEnvelope,
  recipientTransferQr,
  transferSas,
  wipeTransferKeyPair,
  type PairingKeyPair,
} from '../../../shared/crypto/device-transfer'
import { storeDeviceSecretKey } from '../../../shared/crypto/secret-key'
import { wipe } from '../../../shared/crypto/sodium'
import {
  cancelSecretKeyTransferAsRecipient,
  claimSecretKeyTransfer,
  createSecretKeyTransfer,
} from '../api/auth-api'

export type ReceiveSecretKeyState =
  | { step: 'starting' }
  | { step: 'waiting'; qr: string; sas: string; expiresAt: number }
  | { step: 'received' }
  | { step: 'expired' }
  | { step: 'failed' }

const POLL_INTERVAL_MS = 2_000

interface RecipientSession {
  transferId: string
  challenge: string
  pollToken: string
  expiresAt: number
  keyPair: PairingKeyPair
}

/**
 * Recipient side of `recipient-shows-qr`: this browser shows a one-time key,
 * a signed-in phone approves after comparing the SAS, and only ciphertext
 * crosses the backend. The received Secret Key goes straight into the device wrapper.
 */
export function useReceiveSecretKey(accountId: string, onReceived: () => void) {
  const [state, setState] = useState<ReceiveSecretKeyState>({ step: 'starting' })
  const session = useRef<RecipientSession | null>(null)
  const generation = useRef(0)
  const onReceivedRef = useRef(onReceived)
  useEffect(() => { onReceivedRef.current = onReceived }, [onReceived])

  const discard = useCallback((cancelRemote: boolean) => {
    const own = session.current
    session.current = null
    if (!own) return
    wipeTransferKeyPair(own.keyPair)
    if (cancelRemote) void cancelSecretKeyTransferAsRecipient(own.transferId, own.pollToken)
  }, [])

  const open = useCallback(async () => {
    const current = ++generation.current
    discard(true)
    let keyPair: PairingKeyPair | null = null
    try {
      keyPair = await createTransferKeyPair()
      const offer = await createSecretKeyTransfer(encodeTransferPublicKey(keyPair.publicKey))
      if (current !== generation.current) {
        wipeTransferKeyPair(keyPair)
        void cancelSecretKeyTransferAsRecipient(offer.transferId, offer.pollToken)
        return
      }
      const expiresAt = Date.parse(offer.expiresAt)
      session.current = { ...offer, expiresAt, keyPair }
      const sas = transferSas({
        accountId, transferId: offer.transferId, challenge: offer.challenge, recipientPublicKey: keyPair.publicKey,
      })
      keyPair = null
      setState({ step: 'waiting', qr: recipientTransferQr(offer.transferId, session.current.keyPair.publicKey), sas, expiresAt })
    } catch {
      wipeTransferKeyPair(keyPair)
      if (current === generation.current) setState({ step: 'failed' })
    }
  }, [accountId, discard])

  const restart = useCallback(() => {
    setState({ step: 'starting' })
    return open()
  }, [open])

  useEffect(() => {
    void open()
    const owned = generation
    return () => {
      owned.current++
      discard(true)
    }
  }, [open, discard])

  useEffect(() => {
    if (state.step !== 'waiting') return
    const current = generation.current
    let busy = false
    const timer = window.setInterval(async () => {
      const own = session.current
      if (!own || busy || current !== generation.current) return
      if (Date.now() >= own.expiresAt) {
        discard(true)
        setState({ step: 'expired' })
        return
      }
      busy = true
      let secretKey: Uint8Array | null = null
      try {
        const claim = await claimSecretKeyTransfer(own.transferId, own.pollToken)
        if (current !== generation.current) return
        if (claim.status === 'pending') return
        if (claim.status === 'expired') {
          discard(false)
          setState({ step: 'expired' })
          return
        }
        if (claim.accountId !== accountId) throw new Error('Transfer belongs to another account')
        secretKey = await openTransferEnvelope(
          { accountId, transferId: own.transferId, challenge: own.challenge },
          own.keyPair,
          { kemCiphertext: claim.kemCiphertext, ciphertext: claim.ciphertext },
        )
        await storeDeviceSecretKey(accountId, secretKey)
        discard(false)
        setState({ step: 'received' })
        onReceivedRef.current()
      } catch {
        if (current === generation.current) {
          discard(true)
          setState({ step: 'failed' })
        }
      } finally {
        if (secretKey) wipe(secretKey)
        busy = false
      }
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [state.step, accountId, discard])

  return { state, restart }
}
