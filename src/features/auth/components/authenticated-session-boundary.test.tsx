import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { AuthenticatedSessionBoundary } from './authenticated-session-boundary'
import { useAuthStore } from '../stores/auth-store'

const f = vi.hoisted(() => ({ navigate: vi.fn(), location: { pathname: '/vaults/one', href: '/vaults/one?tab=entries#secret' } }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => f.navigate,
  useRouterState: ({ select }: { select: (state: { location: typeof f.location }) => unknown }) => select({ location: f.location }),
}))
beforeEach(() => {
  f.navigate.mockReset().mockImplementation(() => new Promise(() => {}))
  f.location = { pathname: '/vaults/one', href: '/vaults/one?tab=entries#secret' }
  useAuthStore.setState({ userId: 'own-account', accessToken: 'own-access', refreshToken: 'own-refresh' })
  useAuthStore.getState().unlockVault(new Uint8Array([1]), new Uint8Array([2]))
})
afterEach(() => { useAuthStore.getState().logout() })

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
  expect(useAuthStore.getState()).toMatchObject({ masterKey: null, accessToken: null, refreshToken: 'own-refresh', isVaultLocked: true })
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
