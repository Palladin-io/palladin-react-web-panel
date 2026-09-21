import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react'
import { useAuthStore } from '../../auth'
import { openEntryShare, type EntryShareSnapshot } from '../../../shared/crypto/entry-share'
import { clearEntryShareLink } from '../../../shared/crypto/entry-share-link'
import { encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { clearPendingEntryShare, readPendingEntryShare, subscribePendingEntryShare } from '../../../shared/lib/entry-share-ingress'
import {
  confirmRecipientDisplay, endRecipientShare, openRecipientSession, receiveEntryShare,
  requestRecipientOtp, verifyRecipientOtp, verifyRecipientSecret,
} from './recipient-api'
import { initialReceptionState as initialState, type ReceptionOperation, type ReceptionState } from './reception-state'
import { holdsReception, readReceptionContinuation, retainReception, takeReceptionContinuation } from './reception-continuation'

type Outcome = 'ok' | 'failed' | 'cancelled'

function otpRemaining(operation: ReceptionOperation): number {
  if (operation.emailVerified || operation.ended) return 0
  return Math.ceil(Math.max(0, Math.min(operation.otpWallReadyAt - Date.now(), operation.otpMonotonicReadyAt - performance.now())) / 1000)
}

function setOtpCooldown(operation: ReceptionOperation, seconds: number) {
  operation.otpWallReadyAt = Date.now() + seconds * 1000
  operation.otpMonotonicReadyAt = performance.now() + seconds * 1000
}

export function useShareReception(shareId: string) {
  const [state, setState] = useState<ReceptionState>(() => {
    const restored = readReceptionContinuation(shareId)
    return restored ? { ...restored.state, otpRetryAfterSeconds: otpRemaining(restored.operation) } : initialState
  })
  const operationRef = useRef<ReceptionOperation | null>(null)
  const attached = useRef(false)
  const pending = useSyncExternalStore(subscribePendingEntryShare, () => readPendingEntryShare(shareId))

  function forget() { clearPendingEntryShare() }

  useEffect(() => {
    const link = readPendingEntryShare(shareId)
    if (!link) return
    const restored = takeReceptionContinuation(shareId)
    const existing = operationRef.current
    const operation: ReceptionOperation = restored?.operation ?? (existing?.link === link && !existing.controller.signal.aborted ? existing : {
      link, controller: new AbortController(), busy: false, otpGeneration: 0,
      otpWallReadyAt: 0, otpMonotonicReadyAt: 0,
      emailVerified: false, secretVerified: false, received: false, confirmed: false, ended: false,
      wallDeadline: Infinity, monotonicDeadline: Infinity,
    })
    const { userId, cryptoSessionGeneration } = useAuthStore.getState()
    operationRef.current = operation
    attached.current = true
    const retire = () => {
      operation.controller.abort(); operation.session = undefined; clearTimeout(operation.timer)
      setState({ ...initialState, phase: 'unavailable' })
    }
    const unsubscribeIngress = subscribePendingEntryShare(retire)
    const unsubscribeAuth = useAuthStore.subscribe((current) => {
      if (holdsReception(operation)) return
      if (current.userId !== userId || current.cryptoSessionGeneration !== cryptoSessionGeneration) {
        if (readPendingEntryShare(shareId) === link) clearPendingEntryShare()
        retire()
      }
    })
    return () => {
      unsubscribeIngress(); unsubscribeAuth()
      attached.current = false
      if (holdsReception(operation)) return
      // StrictMode reattaches the same route before this microtask; real navigation disposes the capability.
      queueMicrotask(() => {
        if (attached.current || holdsReception(operation)) return
        operation.controller.abort(); operation.session = undefined; clearTimeout(operation.timer)
        if (readPendingEntryShare(shareId) === link) clearPendingEntryShare()
      })
    }
  }, [shareId])

  const refreshOtpCountdown = useEffectEvent(() => {
    const operation = operationRef.current
    if (!operation || !current(operation)) return
    setState((value) => ({ ...value, otpRetryAfterSeconds: otpRemaining(operation) }))
  })
  useEffect(() => {
    if (state.phase !== 'verification' || state.emailVerified || state.otpRetryAfterSeconds <= 0) return
    const timer = setTimeout(refreshOtpCountdown, 1000)
    return () => clearTimeout(timer)
  }, [state.phase, state.emailVerified, state.otpRetryAfterSeconds])

  function current(operation: ReceptionOperation): boolean {
    if (!attached.current || operationRef.current !== operation || operation.controller.signal.aborted || holdsReception(operation)) return false
    if (Date.now() >= operation.wallDeadline || performance.now() >= operation.monotonicDeadline) forget()
    return !operation.controller.signal.aborted && readPendingEntryShare(shareId) === operation.link
  }

  async function run(action: (operation: ReceptionOperation) => Promise<void>): Promise<Outcome> {
    const operation = operationRef.current
    if (!operation || operation.busy || !current(operation)) return 'cancelled'
    operation.busy = true; setState((value) => ({ ...value, busy: true }))
    try {
      await action(operation)
      return current(operation) ? 'ok' : 'cancelled'
    } catch { return current(operation) ? 'failed' : 'cancelled' }
    finally {
      operation.busy = false
      if (current(operation)) setState((value) => ({ ...value, busy: false }))
    }
  }

  function open(): Promise<Outcome> {
    return run(async (operation) => {
      if (operation.session || operation.ended) return
      const session = await openRecipientSession(shareId, encodeBase64Url(operation.link.accessToken), operation.controller.signal)
      if (!current(operation)) return
      operation.session = session
      const lifetime = Math.max(0, Math.min(Date.parse(session.expiresAt) - Date.now(), 15 * 60_000))
      operation.wallDeadline = Date.now() + lifetime
      operation.monotonicDeadline = performance.now() + lifetime
      operation.timer = setTimeout(forget, Number.isFinite(lifetime) ? lifetime : 0)
      setOtpCooldown(operation, session.otpRetryAfterSeconds ?? 0)
      setState((value) => ({ ...value, phase: 'verification', recipientMode: session.recipientMode, protection: session.protection,
        shareExpiresAt: session.shareExpiresAt ?? null, maximumReceipts: session.maximumReceipts ?? null,
        otpRetryAfterSeconds: otpRemaining(operation) }))
    })
  }

  function requestOtp(language: 'pl' | 'en'): Promise<Outcome> {
    return run(async (operation) => {
      if (!operation.session || operation.session.recipientMode !== 'namedRecipient' || operation.ended || operation.emailVerified) return
      // Only a new generation waits. An ambiguous issuance retries its exact generation.
      if (!operation.pendingOtp && otpRemaining(operation) > 0) return
      operation.pendingOtp ??= operation.otpGeneration + 1
      setState((value) => ({ ...value, otpRetry: true }))
      const response = await requestRecipientOtp(shareId, operation.session, operation.pendingOtp, language, operation.controller.signal)
      if (!current(operation)) return
      operation.otpGeneration = operation.pendingOtp; operation.pendingOtp = undefined
      setOtpCooldown(operation, response.retryAfterSeconds)
      setState((value) => ({ ...value, otpRequested: true, otpRetry: false, otpRetryAfterSeconds: otpRemaining(operation) }))
    })
  }

  function verifyOtp(code: string): Promise<Outcome> {
    return run(async (operation) => {
      if (!operation.session || operation.ended || operation.otpGeneration === 0 || operation.pendingOtp) return
      await verifyRecipientOtp(shareId, operation.session, operation.otpGeneration, code, operation.controller.signal)
      if (!current(operation)) return
      operation.emailVerified = true
      setState((value) => ({ ...value, emailVerified: true, otpRetryAfterSeconds: 0 }))
    })
  }

  function verifySecret(secret: string): Promise<Outcome> {
    return run(async (operation) => {
      if (!operation.session || operation.ended) return
      await verifyRecipientSecret(shareId, operation.session, secret, operation.controller.signal)
      if (!current(operation)) return
      operation.secretVerified = true
      setState((value) => ({ ...value, secretVerified: true }))
    })
  }

  function gatesReady(operation: ReceptionOperation): boolean {
    const session = operation.session
    return !!session && !operation.ended
      && (session.recipientMode === 'anyoneWithLink' || session.recipientMode === 'namedRecipient' && operation.emailVerified)
      && (session.protection === 'none' || ['password', 'pin'].includes(session.protection) && operation.secretVerified)
  }

  function receive(): Promise<Outcome> {
    return run(async (operation) => {
      if (!gatesReady(operation) || operation.received) return
      const packet = await receiveEntryShare(shareId, operation.session!, operation.controller.signal)
      if (!current(operation)) return
      let snapshot: EntryShareSnapshot
      try { snapshot = await openEntryShare(packet, packet, shareId, operation.link.key) }
      catch { if (current(operation)) forget(); return }
      if (!current(operation)) return
      operation.received = true
      setState((value) => ({ ...value, phase: 'received', snapshot }))
    })
  }

  function confirmDisplay(): Promise<Outcome> {
    return run(async (operation) => {
      if (!operation.session || !operation.received || operation.confirmed || operation.ended) return
      try { await confirmRecipientDisplay(shareId, operation.session, operation.controller.signal) }
      catch {
        if (current(operation)) setState((value) => ({ ...value, confirmation: 'failed' }))
        throw new Error('Sharing confirmation unavailable')
      }
      if (!current(operation)) return
      operation.confirmed = true
      setState((value) => ({ ...value, confirmation: 'confirmed' }))
    })
  }

  function end(): Promise<Outcome> {
    return run(async (operation) => {
      if (!gatesReady(operation)) return
      await endRecipientShare(shareId, operation.session!, operation.controller.signal)
      if (!current(operation)) return
      operation.ended = true; operation.session = undefined
      clearEntryShareLink(operation.link)
      setState((value) => ({ ...value, phase: 'ended', otpRetryAfterSeconds: 0 }))
    })
  }

  const canReceive = (state.recipientMode === 'anyoneWithLink' || state.recipientMode === 'namedRecipient' && state.emailVerified)
    && (state.protection === 'none' || ['password', 'pin'].includes(state.protection) && state.secretVerified)
  return { ...state, phase: pending ? state.phase : 'unavailable' as const, snapshot: pending ? state.snapshot : null,
    canReceive, open, requestOtp, verifyOtp, verifySecret, receive, confirmDisplay, end, forget,
    continueToAccount: () => {
      const operation = operationRef.current
      return !!operation && current(operation) && retainReception(operation, state)
    } }
}
