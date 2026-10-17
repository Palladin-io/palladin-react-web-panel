import type { EntryShareSnapshot } from '../../../shared/crypto/entry-share'
import type { readPendingEntryShare } from '../../../shared/lib/entry-share-ingress'
import type { RecipientSession } from './recipient-api'

export interface ReceptionState {
  phase: 'welcome' | 'verification' | 'received' | 'ended' | 'unavailable'
  busy: boolean
  recipientMode: string
  protection: string
  otpRequested: boolean
  otpRetry: boolean
  otpRetryAfterSeconds: number
  shareExpiresAt: string | null
  maximumReceipts: number | null
  emailVerified: boolean
  secretVerified: boolean
  snapshot: EntryShareSnapshot | null
  confirmation: 'pending' | 'confirmed' | 'failed'
}
export const initialReceptionState: ReceptionState = {
  phase: 'welcome', busy: false, recipientMode: '', protection: '', otpRequested: false,
  otpRetry: false, emailVerified: false, secretVerified: false, snapshot: null, confirmation: 'pending',
  otpRetryAfterSeconds: 0, shareExpiresAt: null, maximumReceipts: null,
}
export interface ReceptionOperation {
  link: NonNullable<ReturnType<typeof readPendingEntryShare>>
  controller: AbortController
  session?: RecipientSession
  busy: boolean
  otpGeneration: number
  pendingOtp?: number
  otpWallReadyAt: number
  otpMonotonicReadyAt: number
  emailVerified: boolean
  secretVerified: boolean
  received: boolean
  confirmed: boolean
  ended: boolean
  wallDeadline: number
  monotonicDeadline: number
  timer?: ReturnType<typeof setTimeout>
}
