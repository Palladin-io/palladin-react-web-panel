import { captureManualUnlockFence } from './manual-unlock-attempt'
import { parseJwtPayload } from '../../../shared/lib/jwt'
import { browserSessionNoticeKey, readBrowserSessionNotice } from './browser-session-notice'
import { HTTPError } from 'ky'
import type { AuthResponse } from '../../../shared/api/types'
import { browserSessionPost } from '../../../shared/api/browser-session-transport'
import { useAuthStore } from '../stores/auth-store'
import { clearClientSession, captureClientSessionGeneration, clientSessionGenerationMatches } from './client-session'

let refresh: { generation: number; expectedSessionId?: string; promise: Promise<AuthResponse> } | undefined

export function refreshBrowserSession(expectedSessionId?: string): Promise<AuthResponse> {
  const generation = captureClientSessionGeneration()
  if (refresh?.generation === generation && refresh.expectedSessionId === expectedSessionId) return refresh.promise
  const attempt = { generation, expectedSessionId, promise: expectedSessionId
    ? browserSessionPost<AuthResponse>('auth/refresh', { json: { expectedSessionId } })
    : browserSessionPost<AuthResponse>('auth/refresh') }
  refresh = attempt
  void attempt.promise.finally(() => { if (refresh === attempt) refresh = undefined }).catch(() => undefined)
  return attempt.promise
}

export function logoutBrowserSession(expectedSessionId: string): Promise<void> {
  return browserSessionPost('auth/logout', { json: { expectedSessionId } })
}

export async function bootstrapBrowserSession(): Promise<void> {
  const generation = captureClientSessionGeneration()
  let legacy: string | undefined
  const stored = localStorage.getItem('palladin-auth')
  // Remove the entire untrusted legacy envelope before network or store writes.
  localStorage.removeItem('palladin-auth')
  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored)
      if (parsed && typeof parsed === 'object' && 'state' in parsed) {
        const state = parsed.state
        if (state && typeof state === 'object' && 'refreshToken' in state && typeof state.refreshToken === 'string') {
          legacy = state.refreshToken
        }
      }
    } catch { /* Corrupt local state grants no session authority. */ }
  }
  try {
    if (await finishPendingBrowserLogout()) { await clearClientSession(); return }
    let session: AuthResponse
    if (legacy) {
      try { session = await browserSessionPost<AuthResponse>('auth/migrate', { json: { refreshToken: legacy } }) }
      catch (error) {
        // An already established cookie always wins over obsolete local storage.
        if (!(error instanceof HTTPError) || error.response.status !== 409) throw error
        session = await refreshBrowserSession()
      } finally { legacy = undefined }
    } else session = await refreshBrowserSession()
    if (clientSessionGenerationMatches(generation)) useAuthStore.getState().setTokens(session, true)
  } catch (error) {
    if (error instanceof HTTPError && error.response.status === 401) { await clearClientSession(); return }
    throw error
  }
}

async function finishPendingBrowserLogout(): Promise<boolean> {
  const notice = readBrowserSessionNotice()
  if (notice?.kind !== 'logout') return false
  try { await logoutBrowserSession(notice.sessionId) }
  catch (error) {
    // A newer cookie must remain untouched. Only a new deliberate session
    // installation can supersede the durable logout denial.
    if (!(error instanceof HTTPError) || error.response.status !== 409) throw error
  }
  return readBrowserSessionNotice()?.nonce === notice.nonce
}

let revalidation: Promise<void> | undefined
export function revalidateBrowserSession(): Promise<void> {
  // Popup focus/visibility events must not supersede the user's admitted login.
  if (!captureManualUnlockFence()()) return Promise.resolve()
  if (revalidation) return revalidation
  const captured = useAuthStore.getState()
  const generation = captureClientSessionGeneration()
  const notice = readBrowserSessionNotice()
  const current = () => clientSessionGenerationMatches(generation)
    && useAuthStore.getState().sessionId === captured.sessionId
    && useAuthStore.getState().accessToken === captured.accessToken
  useAuthStore.setState({ sessionRevalidating: true })
  const pending = (async () => {
    try {
      if (await finishPendingBrowserLogout()) {
        if (current() && notice?.sessionId === captured.sessionId) await clearClientSession()
        return
      }
      const session = await refreshBrowserSession()
      if (!current() || readBrowserSessionNotice()?.nonce !== notice?.nonce) return
      const sameIdentity = session.userId === captured.userId
        && parseJwtPayload(session.accessToken).org_id === parseJwtPayload(captured.accessToken ?? '').org_id
      const sharedContinuation = typeof parseJwtPayload(captured.accessToken ?? '').org_id === 'string' && notice?.kind === 'shared' && notice.sessionId === session.sessionId && sameIdentity
      if (!sameIdentity || (session.sessionId !== captured.sessionId && !sharedContinuation)) {
        const cleanup = clearClientSession()
        const clearedGeneration = captureClientSessionGeneration()
        await cleanup
        if (!clientSessionGenerationMatches(clearedGeneration)) return
        // clearClientSession publishes synchronously; cleanup must not overwrite a new login.
        if (useAuthStore.getState().sessionId !== null) return
      }
      useAuthStore.getState().setTokens(session, true)
    } catch (error) {
      if (!current()) return
      if (error instanceof HTTPError && error.response.status === 401) await clearClientSession()
      else useAuthStore.getState().expireSession()
    } finally { useAuthStore.setState({ sessionRevalidating: false }) }
  })()
  const settled: Promise<void> = pending.then(async () => {
    if (revalidation === settled) revalidation = undefined
    // A peer can replace the cookie while our response is in flight. Do not
    // publish that response or lose the transition behind the coalesced read.
    if (readBrowserSessionNotice()?.nonce !== notice?.nonce) await revalidateBrowserSession()
  })
  revalidation = settled
  return settled
}

export function installBrowserSessionLifecycle(): () => void {
  const revalidate = () => { void revalidateBrowserSession() }
  const visible = () => { if (document.visibilityState === 'visible') revalidate() }
  const changed = (event: StorageEvent) => {
    if (event.key !== browserSessionNoticeKey) return
    const notice = readBrowserSessionNotice(), current = useAuthStore.getState()
    if (notice?.kind === 'logout' && notice.sessionId === current.sessionId) {
      void clearClientSession()
      return
    }
    // A replacement must erase visible plaintext before the authoritative read.
    if (notice?.kind === 'replace' && notice.sessionId !== current.sessionId) current.expireSession()
    revalidate()
  }
  window.addEventListener('storage', changed)
  window.addEventListener('pageshow', revalidate)
  window.addEventListener('online', revalidate)
  document.addEventListener('visibilitychange', visible)
  return () => {
    window.removeEventListener('storage', changed)
    window.removeEventListener('pageshow', revalidate)
    window.removeEventListener('online', revalidate)
    document.removeEventListener('visibilitychange', visible)
  }
}
