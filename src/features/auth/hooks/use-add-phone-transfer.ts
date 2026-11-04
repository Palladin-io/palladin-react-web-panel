import { useCallback, useEffect, useRef, useState } from 'react'
import {
  decodeTransferPublicKey,
  sealSecretKeyForTransfer,
  senderTransferQr,
  transferSas,
  type TransferSession,
} from '../../../shared/crypto/device-transfer'
import { loadDeviceSecretKey } from '../../../shared/crypto/secret-key'
import { wipe } from '../../../shared/crypto/sodium'
import {
  cancelSenderTransfer,
  createSenderTransfer,
  deliverSenderTransfer,
  getSenderTransfer,
} from '../api/secret-key-transfer-api'

export type AddPhoneState =
  | { step: 'starting' }
  | { step: 'waiting'; qr: string; expiresAt: number }
  | { step: 'compare'; sas: string; expiresAt: number }
  | { step: 'sending' }
  | { step: 'done' }
  | { step: 'rejected' }
  | { step: 'expired' }
  | { step: 'failed' }

const POLL_INTERVAL_MS = 2_000

/**
 * Sender side of `sender-shows-qr`. The SAS is computed from this browser's own
 * session values (account, transfer, challenge) and the key the backend relays;
 * the Secret Key is sealed only after the user confirms the codes match.
 */
export function useAddPhoneTransfer(accountId: string) {
  const [state, setState] = useState<AddPhoneState>({ step: 'starting' })
  const session = useRef<{ transferId: string; challenge: string; expiresAt: number } | null>(null)
  const pairing = useRef<TransferSession | null>(null)
  const finished = useRef(false)
  const generation = useRef(0)

  const cancelRemote = useCallback(() => {
    const transferId = session.current?.transferId
    session.current = null
    pairing.current = null
    if (transferId && !finished.current) void cancelSenderTransfer(transferId)
  }, [])

  const open = useCallback(async () => {
    const current = ++generation.current
    cancelRemote()
    finished.current = false
    const created = await createSenderTransfer().catch(() => null)
    if (current !== generation.current) return
    if (!created) {
      setState({ step: 'failed' })
      return
    }
    const expiresAt = Date.parse(created.expiresAt)
    session.current = { transferId: created.transferId, challenge: created.challenge, expiresAt }
    setState({ step: 'waiting', qr: senderTransferQr(created.transferId, created.challenge), expiresAt })
  }, [cancelRemote])

  const restart = useCallback(() => {
    setState({ step: 'starting' })
    return open()
  }, [open])

  useEffect(() => {
    // State changes only after the session request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void open()
    const owned = generation
    return () => {
      owned.current++
      cancelRemote()
    }
  }, [open, cancelRemote])

  useEffect(() => {
    if (state.step !== 'waiting') return
    const current = generation.current
    const timer = window.setInterval(async () => {
      const own = session.current
      if (!own || current !== generation.current) return
      if (Date.now() >= own.expiresAt) {
        cancelRemote()
        setState({ step: 'expired' })
        return
      }
      try {
        const relayed = await getSenderTransfer(own.transferId)
        if (current !== generation.current || !relayed.recipientPublicKey) return
        const recipientPublicKey = decodeTransferPublicKey(relayed.recipientPublicKey)
        pairing.current = { accountId, transferId: own.transferId, challenge: own.challenge, recipientPublicKey }
        setState({ step: 'compare', sas: transferSas(pairing.current), expiresAt: own.expiresAt })
      } catch {
        if (current === generation.current) {
          cancelRemote()
          setState({ step: 'failed' })
        }
      }
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [state.step, accountId, cancelRemote])

  const approve = useCallback(async () => {
    const own = pairing.current
    if (!own || state.step !== 'compare') return
    if (Date.now() >= state.expiresAt) {
      cancelRemote()
      setState({ step: 'expired' })
      return
    }
    setState({ step: 'sending' })
    const secretKey = await loadDeviceSecretKey(accountId).catch(() => null)
    try {
      if (!secretKey) throw new Error('This browser holds no Secret Key')
      const envelope = await sealSecretKeyForTransfer(own, true, secretKey)
      await deliverSenderTransfer(own.transferId, envelope)
      finished.current = true
      session.current = null
      pairing.current = null
      setState({ step: 'done' })
    } catch {
      cancelRemote()
      setState({ step: 'failed' })
    } finally {
      if (secretKey) wipe(secretKey)
    }
  }, [accountId, cancelRemote, state])

  const reject = useCallback(() => {
    generation.current++
    cancelRemote()
    setState({ step: 'rejected' })
  }, [cancelRemote])

  return { state, approve, reject, restart }
}
