import { beforeEach, expect, it, vi } from 'vitest'
import { HTTPError } from 'ky'
import { useAuthStore, getIsAuthenticated } from '../stores/auth-store'
import { bootstrapBrowserSession, refreshBrowserSession } from './browser-session'
import { browserSessionPost } from '../../../shared/api/browser-session-transport'
vi.mock('../../../shared/api/browser-session-transport', () => ({ browserSessionPost: vi.fn() }))
vi.mock('../../../shared/lib/analytics', () => ({ analytics: { reset: vi.fn() } }))
const session = { accessToken: 'synthetic-access', sessionId: 'session', userId: 'u', isOnboarded: true }
const unauthorized = () => new HTTPError(new Response(null, { status: 401 }), new Request('https://example.test'), {} as never)

beforeEach(() => { vi.clearAllMocks(); useAuthStore.getState().logout(); localStorage.clear() })

it('removes legacy persistence before exchanging once and restores only a locked session', async () => {
  localStorage.setItem('palladin-auth', JSON.stringify({ state: { refreshToken: 'synthetic-legacy', userId: 'u' } }))
  vi.mocked(browserSessionPost).mockImplementation(async () => {
    expect(localStorage.getItem('palladin-auth') ?? '').not.toContain('synthetic-legacy')
    expect(getIsAuthenticated()).toBe(false)
    return session
  })
  await bootstrapBrowserSession()
  expect(browserSessionPost).toHaveBeenCalledExactlyOnceWith('auth/migrate', { json: { refreshToken: 'synthetic-legacy' } })
  expect(useAuthStore.getState()).toMatchObject({ sessionId: 'session', isVaultLocked: true, masterKey: null })
  expect(localStorage.getItem('palladin-auth') ?? '').not.toContain('synthetic-legacy')
})

it('never restores the legacy credential when exchange fails', async () => {
  localStorage.setItem('palladin-auth', JSON.stringify({ state: { refreshToken: 'synthetic-legacy' } }))
  vi.mocked(browserSessionPost).mockRejectedValue(unauthorized())
  await bootstrapBrowserSession()
  expect(getIsAuthenticated()).toBe(false)
  expect(localStorage.getItem('palladin-auth') ?? '').not.toContain('synthetic-legacy')
})

it('restores a cookie session on a cold deep link without persisted auth', async () => {
  vi.mocked(browserSessionPost).mockResolvedValue(session)
  await bootstrapBrowserSession()
  expect(browserSessionPost).toHaveBeenCalledExactlyOnceWith('auth/refresh')
  expect(getIsAuthenticated()).toBe(true)
  expect(useAuthStore.getState().isVaultLocked).toBe(true)
})

it('distinguishes a transient outage from a rejected session and keeps keys locked', async () => {
  vi.mocked(browserSessionPost).mockRejectedValue(new TypeError('network'))
  await expect(bootstrapBrowserSession()).rejects.toThrow('network')
  expect(getIsAuthenticated()).toBe(false)
  expect(useAuthStore.getState().masterKey).toBeNull()
})

it('coalesces concurrent refresh without sending session secrets', async () => {
  let resolve!: (value: typeof session) => void
  vi.mocked(browserSessionPost).mockReturnValue(new Promise(r => { resolve = r }))
  const first = refreshBrowserSession()
  const second = refreshBrowserSession()
  resolve(session)
  await expect(first).resolves.toEqual(session)
  await expect(second).resolves.toEqual(session)
  expect(browserSessionPost).toHaveBeenCalledOnce()
})

it('clears keys when revalidation discovers a different account', async () => {
  const { revalidateBrowserSession } = await import('./browser-session')
  useAuthStore.getState().setTokens(session)
  useAuthStore.getState().unlockVault(new Uint8Array([1]), new Uint8Array([2]))
  const oldKeys = useAuthStore.getState().masterKey!
  vi.mocked(browserSessionPost).mockResolvedValue({ ...session, sessionId: 'other-session', userId: 'other' })
  await revalidateBrowserSession()
  expect([...oldKeys]).toEqual([0])
  expect(useAuthStore.getState()).toMatchObject({ userId: 'other', isVaultLocked: true })
})

it('keeps existing limits on a same-session refresh', async () => {
  const { revalidateBrowserSession } = await import('./browser-session')
  useAuthStore.getState().setTokens(session)
  useAuthStore.getState().unlockVault(new Uint8Array([1]), new Uint8Array([2]))
  const limits = useAuthStore.getState().unlockLimits
  vi.mocked(browserSessionPost).mockResolvedValue({ ...session, accessToken: 'renewed' })
  await revalidateBrowserSession()
  expect(useAuthStore.getState()).toMatchObject({ isVaultLocked: false, accessToken: 'renewed', unlockLimits: limits })
})

it('cannot publish a delayed revalidation after local logout', async () => {
  const { revalidateBrowserSession } = await import('./browser-session')
  const { clearClientSession } = await import('./client-session')
  useAuthStore.getState().setTokens(session)
  let resolve!: (value: typeof session) => void
  vi.mocked(browserSessionPost).mockReturnValue(new Promise(r => { resolve = r }))
  const pending = revalidateBrowserSession()
  await clearClientSession()
  resolve(session)
  await pending
  expect(getIsAuthenticated()).toBe(false)
})

it('reconciles a shared handoff for the same account and org without renewing keys or limits', async () => {
  const { revalidateBrowserSession } = await import('./browser-session')
  const { publishBrowserSessionNotice } = await import('./browser-session-notice')
  const jwt = `header.${btoa(JSON.stringify({ org_id: 'org' }))}.signature`
  useAuthStore.getState().setTokens({ ...session, accessToken: jwt })
  useAuthStore.getState().unlockVault(new Uint8Array([1]), new Uint8Array([2]))
  const { masterKey, unlockLimits } = useAuthStore.getState()
  publishBrowserSessionNotice('shared', 'new-shared')
  vi.mocked(browserSessionPost).mockResolvedValue({ ...session, accessToken: jwt, sessionId: 'new-shared' })
  await revalidateBrowserSession()
  expect(useAuthStore.getState().masterKey).toBe(masterKey)
  expect(useAuthStore.getState().unlockLimits).toBe(unlockLimits)
  expect(useAuthStore.getState()).toMatchObject({ sessionId: 'new-shared', isVaultLocked: false })
})

it('does not accept a shared-continuation hint across organizations', async () => {
  const { revalidateBrowserSession } = await import('./browser-session')
  const { publishBrowserSessionNotice } = await import('./browser-session-notice')
  const jwt = (org_id: string) => `header.${btoa(JSON.stringify({ org_id }))}.signature`
  useAuthStore.getState().setTokens({ ...session, accessToken: jwt('old-org') })
  useAuthStore.getState().unlockVault(new Uint8Array([1]), new Uint8Array([2]))
  publishBrowserSessionNotice('shared', 'new-shared')
  vi.mocked(browserSessionPost).mockResolvedValue({ ...session, accessToken: jwt('new-org'), sessionId: 'new-shared' })
  await revalidateBrowserSession()
  expect(useAuthStore.getState().isVaultLocked).toBe(true)
  expect(useAuthStore.getState().masterKey).toBeNull()
})

it('does not silently restore a cookie after an offline logout and reload', async () => {
  const { publishBrowserSessionNotice } = await import('./browser-session-notice')
  publishBrowserSessionNotice('logout', session.sessionId)
  vi.mocked(browserSessionPost).mockRejectedValue(new TypeError('offline'))
  await expect(bootstrapBrowserSession()).rejects.toThrow('offline')
  expect(browserSessionPost).toHaveBeenCalledExactlyOnceWith('auth/logout', { json: { expectedSessionId: session.sessionId } })
  expect(getIsAuthenticated()).toBe(false)
})

it('never restores a newer cookie over a still-pending explicit logout', async () => {
  const { publishBrowserSessionNotice } = await import('./browser-session-notice')
  publishBrowserSessionNotice('logout', 'old-session')
  vi.mocked(browserSessionPost).mockRejectedValue(new HTTPError(new Response(null, { status: 409 }), new Request('https://example.test'), {} as never))
  await bootstrapBrowserSession()
  expect(browserSessionPost).toHaveBeenCalledOnce()
  expect(getIsAuthenticated()).toBe(false)
})

it('ignores persisted user hints after an invalid cookie', async () => {
  useAuthStore.setState({ userId: 'stale-user' })
  vi.mocked(browserSessionPost).mockRejectedValue(unauthorized())
  await bootstrapBrowserSession()
  expect(useAuthStore.getState().userId).toBeNull()
})

it('rechecks a transition arriving during refresh before publishing an obsolete session', async () => {
  const { revalidateBrowserSession } = await import('./browser-session')
  const { publishBrowserSessionNotice } = await import('./browser-session-notice')
  useAuthStore.getState().setTokens(session)
  let resolve!: (value: typeof session) => void
  vi.mocked(browserSessionPost).mockReturnValueOnce(new Promise(r => { resolve = r }))
    .mockResolvedValueOnce({ ...session, sessionId: 'new-cookie', accessToken: 'current-access' })
  const pending = revalidateBrowserSession()
  await vi.waitFor(() => expect(browserSessionPost).toHaveBeenCalledOnce())
  publishBrowserSessionNotice('replace', 'new-cookie')
  const concurrent = revalidateBrowserSession()
  const published: string[] = []
  const unsubscribe = useAuthStore.subscribe(state => { if (state.accessToken) published.push(state.accessToken) })
  resolve({ ...session, accessToken: 'obsolete-response' })
  await Promise.all([pending, concurrent])
  unsubscribe()
  expect(published).not.toContain('obsolete-response')
  expect(browserSessionPost).toHaveBeenCalledTimes(2)
  expect(useAuthStore.getState()).toMatchObject({ sessionId: 'new-cookie', accessToken: 'current-access', isVaultLocked: true })
})
