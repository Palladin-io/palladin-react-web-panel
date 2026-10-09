import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSessionTimeout } from '../hooks/use-session-timeout'
import { revalidateBrowserSession } from '../session/browser-session'
import { browserSessionPost } from '../../../shared/api/browser-session-transport'
vi.mock('../../../shared/api/browser-session-transport', () => ({ browserSessionPost: vi.fn() }))
import { AuthenticatedSessionBoundary } from './authenticated-session-boundary'
import { useAuthStore } from '../stores/auth-store'

const f = vi.hoisted(() => ({ navigate: vi.fn(), location: { pathname: '/vaults/one', href: '/vaults/one?tab=entries#secret' } }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => f.navigate,
  useRouter: () => ({ state: { location: f.location } }),
  useRouterState: ({ select }: { select: (state: { location: typeof f.location }) => unknown }) => select({ location: f.location }),
}))
beforeEach(() => {
  f.navigate.mockReset().mockImplementation(() => new Promise(() => {}))
  f.location = { pathname: '/vaults/one', href: '/vaults/one?tab=entries#secret' }
  useAuthStore.setState({ userId: 'own-account', accessToken: 'own-access', sessionId: 'own-refresh' })
  useAuthStore.getState().unlockVault(new Uint8Array([1]), new Uint8Array([2]))
})
afterEach(() => { act(() => useAuthStore.getState().logout()); localStorage.clear(); vi.useRealTimers() })

it.each(['lockVault', 'expireSession', 'logout'] as const)('unmounts protected children on %s while router navigation is still pending', action => {
  const disposed = vi.fn()
  function Secret() { useEffect(() => disposed, []); return <div>synthetic visible secret</div> }
  render(<AuthenticatedSessionBoundary><Secret /></AuthenticatedSessionBoundary>)
  expect(screen.getByText('synthetic visible secret')).toBeInTheDocument()
  act(() => { useAuthStore.getState()[action]() })
  expect(screen.queryByText('synthetic visible secret')).not.toBeInTheDocument()
  expect(disposed).toHaveBeenCalledOnce()
  expect(f.navigate).toHaveBeenCalledExactlyOnceWith({ to: action === 'logout' ? '/login' : '/unlock', replace: true,
    search: { redirect: '/vaults/one?tab=entries#secret' } })
})

it('keeps the unlock surface available for its own persisted refresh lineage without resetting keys or tokens', () => {
  useAuthStore.getState().expireSession()
  f.location = { pathname: '/unlock', href: '/unlock?redirect=%2Fvaults%2Fone' }
  render(<AuthenticatedSessionBoundary><div>own unlock form</div></AuthenticatedSessionBoundary>)
  expect(screen.getByText('own unlock form')).toBeInTheDocument(); expect(f.navigate).not.toHaveBeenCalled()
  expect(useAuthStore.getState()).toMatchObject({ masterKey: null, accessToken: null, sessionId: 'own-refresh', isVaultLocked: true })
})

it('preserves the original internal destination when logout happens on the unlock screen', () => {
  useAuthStore.getState().lockVault()
  f.location = { pathname: '/unlock', href: '/unlock?redirect=%2Fvaults%2Fone%3Ftab%3Dlogs' }
  render(<AuthenticatedSessionBoundary><div>own unlock form</div></AuthenticatedSessionBoundary>)
  act(() => { useAuthStore.getState().logout() })
  expect(screen.queryByText('own unlock form')).not.toBeInTheDocument()
  expect(f.navigate).toHaveBeenCalledWith({ to: '/login', replace: true, search: { redirect: '/vaults/one?tab=logs' } })
})

it('does not redirect a lock immediately superseded by a new own unlock before effects run', () => {
  render(<AuthenticatedSessionBoundary><div>own content</div></AuthenticatedSessionBoundary>)
  act(() => {
    useAuthStore.getState().lockVault()
    useAuthStore.getState().unlockVault(new Uint8Array([3]), new Uint8Array([4]))
  })
  expect(screen.getByText('own content')).toBeInTheDocument(); expect(f.navigate).not.toHaveBeenCalled()
})


it.each(['idleDeadlineMs', 'absoluteDeadlineMs', 'offlineDeadlineMs'] as const)(
  'keeps expiry mounted and wipes keys at %s during a stalled cookie revalidation', async ceiling => {
    vi.useFakeTimers()
    const now = Date.now()
    useAuthStore.getState().unlockVault(new Uint8Array([3]), new Uint8Array([4]), {
      unlockedAtMs: now, idleDeadlineMs: now + 60_000,
      absoluteDeadlineMs: now + 60_000, offlineDeadlineMs: now + 60_000,
      [ceiling]: now + 1234,
    })
    const { masterKey, privateKey } = useAuthStore.getState()
    let resolve!: (value: unknown) => void
    vi.mocked(browserSessionPost).mockReturnValue(new Promise(r => { resolve = r }))
    function Protected() { useSessionTimeout(); return <div>protected draft</div> }
    render(<AuthenticatedSessionBoundary><Protected /></AuthenticatedSessionBoundary>)
    let pending!: Promise<void>
    await act(async () => { pending = revalidateBrowserSession() })
    expect(useAuthStore.getState().sessionRevalidating).toBe(true)
    act(() => { vi.advanceTimersByTime(1234) })
    const expired = useAuthStore.getState()
    resolve({ accessToken: 'late-access', sessionId: 'own-refresh', userId: 'own-account', isOnboarded: true })
    await act(async () => { await pending })
    expect(expired).toMatchObject({ masterKey: null, privateKey: null, accessToken: null, isVaultLocked: true })
    expect([...masterKey!, ...privateKey!]).toEqual([0, 0])
    expect(screen.queryByText('protected draft')).not.toBeInTheDocument()
    expect(useAuthStore.getState().accessToken).toBeNull()
  },
)

it('preserves an unchanged-session draft while hiding and disabling ordinary and portaled content', async () => {
  let resolve!: (value: unknown) => void
  vi.mocked(browserSessionPost).mockReturnValue(new Promise(r => { resolve = r }))
  const disposed = vi.fn()
  function Draft() {
    const [value, setValue] = useState('')
    useEffect(() => disposed, [])
    return <><input aria-label="Entry draft" value={value} onChange={event => setValue(event.target.value)} />
      {createPortal(<div>portaled synthetic secret</div>, document.body)}</>
  }
  render(<AuthenticatedSessionBoundary><Draft /></AuthenticatedSessionBoundary>)
  fireEvent.change(screen.getByLabelText('Entry draft'), { target: { value: 'unsaved synthetic credential' } })
  let pending!: Promise<void>
  await act(async () => { pending = revalidateBrowserSession() })
  const draftDuringCheck = screen.queryByLabelText('Entry draft')
  const portalDuringCheck = screen.queryByText('portaled synthetic secret')
  const inertDuringCheck = document.body.inert
  const displayDuringCheck = getComputedStyle(document.body).display
  resolve({ accessToken: 'refreshed', sessionId: 'own-refresh', userId: 'own-account', isOnboarded: true })
  await act(async () => { await pending })
  expect(draftDuringCheck).not.toBeNull()
  expect(portalDuringCheck).not.toBeNull()
  expect(inertDuringCheck).toBe(true)
  expect(displayDuringCheck).toBe('none')
  expect(document.body.inert).not.toBe(true)
  expect(disposed).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Entry draft')).toHaveValue('unsaved synthetic credential')
  expect(screen.getByLabelText('Entry draft')).toBeVisible()
  expect(screen.getByText('portaled synthetic secret')).toBeVisible()
})
