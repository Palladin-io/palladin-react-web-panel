import type { SharedUnlockAuthorization, SharedUnlockCommit, SharedUnlockManualInput, SharedUnlockOperation, SharedUnlockPreference } from './api-types'

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

  authorize(session: SharedUnlockOwnSession, input: SharedUnlockManualInput, signal: AbortSignal): Promise<SharedUnlockAuthorization> {
    return this.request(session.apiUrl, '/api/account/shared-unlock/authorizations', { ...input, refreshToken: session.refreshToken }, signal, session)
  }

  consume(apiUrl: string, operationId: string, signature: string, signal: AbortSignal): Promise<SharedUnlockOperation> {
    return this.request(apiUrl, `/api/auth/shared-unlock/operations/${encodeURIComponent(operationId)}/consume`, { signature }, signal)
  }

  commit(apiUrl: string, operationId: string, signature: string, signal: AbortSignal): Promise<SharedUnlockCommit> {
    return this.request(apiUrl, `/api/auth/shared-unlock/operations/${encodeURIComponent(operationId)}/commit`, { signature }, signal)
  }

  private async request<T>(apiUrl: string, path: string, body: object | undefined, signal: AbortSignal, session?: SharedUnlockOwnSession): Promise<T> {
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
      check()
      if (!response.ok) {
        throw new SharedUnlockApiError(({ 401: 'unauthorized', 403: 'forbidden', 404: 'not-found', 409: 'conflict',
          429: 'rate-limited', 503: 'unavailable' } as const)[response.status] ?? 'network')
      }
      const result = await response.json() as T
      check()
      return result
    } catch (error) {
      check()
      if (error instanceof SharedUnlockApiError) throw error
      throw new SharedUnlockApiError('network')
    }
  }
}
