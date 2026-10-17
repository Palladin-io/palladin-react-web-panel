import ky from 'ky'
import { env } from '../../../shared/lib/env'
import type { EntryShareCiphertext, EntryShareScope } from '../../../shared/crypto/entry-share'

export interface RecipientSession {
  sessionId: string
  sessionToken: string
  expiresAt: string
  recipientMode: string
  protection: string
  shareExpiresAt?: string | null
  maximumReceipts?: number | null
  otpRetryAfterSeconds?: number
}

const recipientApi = ky.create({
  prefixUrl: env.apiUrl, credentials: 'omit', cache: 'no-store', redirect: 'error',
  referrerPolicy: 'no-referrer', retry: 0, timeout: 15_000,
})

function sharePath(shareId: string): string {
  return `api/entry-shares/${encodeURIComponent(shareId)}/sessions`
}

async function post(path: string, body: object, signal: AbortSignal): Promise<Response> {
  try { return await recipientApi.post(path, { json: body, signal }) }
  catch { throw new Error('Sharing request unavailable') }
}

async function readJson<T>(response: Response): Promise<T> {
  try { return await response.json() }
  catch { throw new Error('Sharing request unavailable') }
}

export async function openRecipientSession(shareId: string, accessToken: string, signal: AbortSignal): Promise<RecipientSession> {
  const response = await post(sharePath(shareId), { accessToken }, signal)
  return readJson<RecipientSession>(response)
}

function sessionPath(shareId: string, session: RecipientSession): string {
  return `${sharePath(shareId)}/${encodeURIComponent(session.sessionId)}`
}

export async function requestRecipientOtp(shareId: string, session: RecipientSession, generation: number, language: 'pl' | 'en', signal: AbortSignal) {
  const response = await post(`${sessionPath(shareId, session)}/otp`, { sessionToken: session.sessionToken, generation, language }, signal)
  return readJson<{ retryAfterSeconds: number }>(response)
}

export async function verifyRecipientOtp(shareId: string, session: RecipientSession, generation: number, code: string, signal: AbortSignal) {
  await post(`${sessionPath(shareId, session)}/verify-otp`, { sessionToken: session.sessionToken, generation, code }, signal)
}

export async function verifyRecipientSecret(shareId: string, session: RecipientSession, secret: string, signal: AbortSignal) {
  await post(`${sessionPath(shareId, session)}/verify-secret`, { sessionToken: session.sessionToken, secret }, signal)
}

export async function receiveEntryShare(shareId: string, session: RecipientSession, signal: AbortSignal): Promise<EntryShareScope & EntryShareCiphertext> {
  const response = await post(`${sessionPath(shareId, session)}/delivery`, { sessionToken: session.sessionToken }, signal)
  return readJson<EntryShareScope & EntryShareCiphertext>(response)
}

export async function confirmRecipientDisplay(shareId: string, session: RecipientSession, signal: AbortSignal) {
  await post(`${sessionPath(shareId, session)}/confirmation`, { sessionToken: session.sessionToken }, signal)
}

export async function verifyRecipientAccount(shareId: string, session: RecipientSession, accountToken: string, signal: AbortSignal) {
  try {
    await recipientApi.post(`${sessionPath(shareId, session)}/verify-account`, {
      json: { sessionToken: session.sessionToken }, headers: { Authorization: `Bearer ${accountToken}` }, signal,
    })
  } catch { throw new Error('Sharing request unavailable') }
}
