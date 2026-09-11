import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SharedUnlockBrowserProvider } from './browser-provider'
import { startSharedUnlockBrowserLifecycle } from './browser-lifecycle'
import { useAuthStore } from '../stores/auth-store'
const config = vi.hoisted(() => ({ sharedUnlockExtensionId: 'a'.repeat(32), apiUrl: 'https://api.example.test' }))
vi.mock('../../../shared/lib/env', () => ({ env: config }))
vi.mock('./browser-lifecycle', () => ({ startSharedUnlockBrowserLifecycle: vi.fn(() => ({ close: vi.fn(), currentRoute: () => null })) }))
beforeEach(() => { vi.clearAllMocks(); config.sharedUnlockExtensionId = 'a'.repeat(32); useAuthStore.getState().logout() })
afterEach(cleanup)
describe('application shared unlock provider', () => {
  it('does not start any channel without explicit deployment configuration', () => {
    config.sharedUnlockExtensionId = ''; render(<SharedUnlockBrowserProvider />)
    expect(startSharedUnlockBrowserLifecycle).not.toHaveBeenCalled()
  })
  it('wires own document retirement to immediate key/access-token wipe, preserving own refresh/account', () => {
    useAuthStore.setState({ accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', userId: 'synthetic-user' })
    useAuthStore.getState().unlockVault(new Uint8Array(32).fill(7), new Uint8Array(32).fill(9))
    const previous = useAuthStore.getState(); render(<SharedUnlockBrowserProvider />)
    const options = vi.mocked(startSharedUnlockBrowserLifecycle).mock.calls[0][0]
    expect(options.apiUrl).toBe(config.apiUrl); expect(options.extensionId).toBe(config.sharedUnlockExtensionId)
    options.retireDocument()
    const current = useAuthStore.getState()
    expect(current.masterKey).toBeNull(); expect(current.privateKey).toBeNull(); expect(current.accessToken).toBeNull()
    expect(current.isVaultLocked).toBe(true); expect(current.cryptoSessionGeneration).toBeGreaterThan(previous.cryptoSessionGeneration)
    expect(current.refreshToken).toBe('synthetic-refresh'); expect(current.userId).toBe('synthetic-user')
    expect(previous.masterKey?.every(value => value === 0)).toBe(true); expect(previous.privateKey?.every(value => value === 0)).toBe(true)
  })
  it('effect unmount closes the transport without expiring the own session', () => {
    useAuthStore.getState().unlockVault(new Uint8Array(32).fill(7), new Uint8Array(32).fill(9))
    const previous = useAuthStore.getState(); const view = render(<SharedUnlockBrowserProvider />); view.unmount()
    expect(vi.mocked(startSharedUnlockBrowserLifecycle).mock.results[0].value.close).toHaveBeenCalledOnce()
    expect(useAuthStore.getState().masterKey).toBe(previous.masterKey); expect(useAuthStore.getState().isVaultLocked).toBe(false)
  })
})
