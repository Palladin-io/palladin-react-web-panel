import { getAnalyticsHeaders } from './analytics-headers'
import ky, { type Options } from 'ky'
import { env } from '../lib/env'

export const browserSessionHeaders = { 'X-Palladin-Browser': '1' }

export async function withBrowserSessionLock<T>(apiUrl: string, action: () => Promise<T>): Promise<T> {
  if (!navigator.locks) return Promise.reject(new Error('Secure browser session coordination unavailable'))
  return navigator.locks.request(`palladin-browser-session:${new URL(apiUrl).origin}`, action)
}

/** Cookie writes must complete under the same origin-wide lock, including body reads. */
export function browserSessionPost<T>(path: string, options: Omit<Options, 'headers'> & { headers?: HeadersInit } = {}): Promise<T> {
  return withBrowserSessionLock(env.apiUrl, async () => {
    const response = await ky.post(`api/browser/${path}`, {
      json: {},
      ...options,
      prefixUrl: env.apiUrl,
      credentials: 'include', redirect: 'error', cache: 'no-store', retry: 0,
      // Aborting fetch cannot roll back a server commit or a late Set-Cookie.
      timeout: false,
      headers: { ...getAnalyticsHeaders(), ...Object.fromEntries(new Headers(options.headers)), ...browserSessionHeaders },
    })
    return response.status === 204 ? undefined as T : response.json<T>()
  })
}
