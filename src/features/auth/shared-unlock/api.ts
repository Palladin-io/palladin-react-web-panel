import type { SharedUnlockActivationInput, SharedUnlockLink, SharedUnlockActivityInput, SharedUnlockAuthorization, SharedUnlockCommit, SharedUnlockManualInput, SharedUnlockOperation, SharedUnlockOperationInput, SharedUnlockPreference } from './api-types'

export interface SharedUnlockOwnSession {
  readonly apiUrl: string
  readonly accessToken: string
  readonly refreshToken: string
  readonly userId: string
}

export class SharedUnlockApiError extends Error {
  readonly code: 'not-found' | 'cancelled' | 'network' | 'unauthorized' | 'forbidden' | 'conflict' | 'rate-limited' | 'unavailable'
  constructor(code: SharedUnlockApiError['code']) {
    super('Shared unlock request failed')
    this.name = 'SharedUnlockApiError'
    this.code = code
  }
}

export class SharedUnlockApi {
  private readonly doFetch: typeof fetch
  private readonly currentApiUrl: () => string
  constructor(doFetch: typeof fetch, currentApiUrl: () => string) {
    this.doFetch = doFetch
    this.currentApiUrl = currentApiUrl
  }

  readPreference(session: SharedUnlockOwnSession, signal: AbortSignal): Promise<SharedUnlockPreference> {
    return this.request(session.apiUrl, '/api/account/shared-unlock', undefined, signal, session)
  }

  createLink(session: SharedUnlockOwnSession, linkId: string, preferenceRevision: number, signal: AbortSignal): Promise<SharedUnlockLink> {
    return this.request(session.apiUrl, '/api/account/shared-unlock/links', { linkId, expectedPreferenceRevision: preferenceRevision }, signal, session)
  }
  readLink(session: SharedUnlockOwnSession, linkId: string, signal: AbortSignal): Promise<SharedUnlockLink> {
    return this.request(session.apiUrl, `/api/account/shared-unlock/links/${encodeURIComponent(linkId)}`, undefined, signal, session)
  }
  lock(session: SharedUnlockOwnSession, linkId: string, revision: number, preferenceRevision: number, signal: AbortSignal): Promise<SharedUnlockLink> {
    return this.request(session.apiUrl, `/api/account/shared-unlock/links/${encodeURIComponent(linkId)}/lock`,
      { expectedRevision: revision, expectedPreferenceRevision: preferenceRevision }, signal, session)
  }
  logout(session: SharedUnlockOwnSession, linkId: string, revision: number, preferenceRevision: number, signal: AbortSignal): Promise<SharedUnlockLink> {
    return this.request(session.apiUrl, `/api/account/shared-unlock/links/${encodeURIComponent(linkId)}/logout`,
      { expectedRevision: revision, expectedPreferenceRevision: preferenceRevision }, signal, session)
  }
  disconnect(session: SharedUnlockOwnSession, linkId: string, revision: number, signal: AbortSignal): Promise<SharedUnlockLink> {
    return this.request(session.apiUrl, `/api/account/shared-unlock/links/${encodeURIComponent(linkId)}/disconnect`,
      { expectedRevision: revision }, signal, session)
  }
  activate(session: SharedUnlockOwnSession, linkId: string, input: SharedUnlockActivationInput, signal: AbortSignal): Promise<SharedUnlockLink> {
    return this.request(session.apiUrl, `/api/account/shared-unlock/links/${encodeURIComponent(linkId)}/activate`, { ...input, refreshToken: session.refreshToken }, signal, session)
  }
  recordActivity(session: SharedUnlockOwnSession, input: SharedUnlockActivityInput, signal: AbortSignal): Promise<SharedUnlockAuthorization> {
    return this.request(session.apiUrl, '/api/account/shared-unlock/authorizations/activity', { ...input, refreshToken: session.refreshToken }, signal, session)
  }

  authorize(session: SharedUnlockOwnSession, input: SharedUnlockManualInput, signal: AbortSignal): Promise<SharedUnlockAuthorization> {
    return this.request(session.apiUrl, '/api/account/shared-unlock/authorizations', { ...input, refreshToken: session.refreshToken }, signal, session)
  }

  createOperation(session: SharedUnlockOwnSession, input: SharedUnlockOperationInput, signal: AbortSignal): Promise<SharedUnlockOperation> {
    return this.request(session.apiUrl, '/api/account/shared-unlock/operations',
      { ...input, refreshToken: session.refreshToken }, signal, session)
  }

  consume(apiUrl: string, operationId: string, signature: string, signal: AbortSignal): Promise<SharedUnlockOperation> {
    return this.request(apiUrl, `/api/auth/shared-unlock/operations/${encodeURIComponent(operationId)}/consume`, { signature }, signal)
  }

  commit(apiUrl: string, operationId: string, signature: string, signal: AbortSignal, onIssued?: (commit: SharedUnlockCommit) => void): Promise<SharedUnlockCommit> {
    return this.request(apiUrl, `/api/auth/shared-unlock/operations/${encodeURIComponent(operationId)}/commit`, { signature }, signal, undefined, onIssued)
  }

  /** Cleanup only: captured original Identity origin, never current client logout. */
  async revokeIssuedSession(apiUrl: string, refreshToken: string): Promise<void> {
    const abort = new AbortController()
    let finishTimeout!: () => void
    const elapsed = new Promise<void>(resolve => { finishTimeout = resolve })
    const timeout = setTimeout(() => { abort.abort(); finishTimeout() }, 2000)
    try {
      await Promise.race([this.doFetch(`${apiUrl.replace(/\/$/, '')}/api/auth/logout`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }), signal: abort.signal,
        redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      }), elapsed])
    } catch { /* best-effort revocation; local key cleanup is unconditional */ }
    finally { clearTimeout(timeout) }
  }

  private async request<T>(apiUrl: string, path: string, body: object | undefined, signal: AbortSignal, session?: SharedUnlockOwnSession, onIssued?: (result: T) => void): Promise<T> {
    const check = () => {
      if (signal.aborted || apiUrl !== this.currentApiUrl()) throw new SharedUnlockApiError('cancelled')
    }
    check()
    try {
      // No generic 401 refresh/retry: a password proof belongs to this exact own session.
      const response = await this.doFetch(`${apiUrl.replace(/\/$/, '')}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { accept: 'application/json',
          ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}),
          ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal, redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      })
      // If commit returned a usable body after cancellation, its newly issued
      // own session must still reach the cleanup observer before rejection.
      if (!onIssued || !response.ok) check()
      if (!response.ok) {
        throw new SharedUnlockApiError(({ 401: 'unauthorized', 403: 'forbidden', 404: 'not-found', 409: 'conflict',
          429: 'rate-limited', 503: 'unavailable' } as const)[response.status] ?? 'network')
      }
      const result = await response.json() as T
      onIssued?.(result)
      check()
      return result
    } catch (error) {
      check()
      if (error instanceof SharedUnlockApiError) throw error
      throw new SharedUnlockApiError('network')
    }
  }
}
