import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../../shared/lib/i18n'
import type { PreferenceItem } from './preferences-api'

const update = vi.hoisted(() => vi.fn())
const webPushState = vi.hoisted(() => ({
  isSupported: true,
  status: 'registered' as string,
  requestPermissionAndRegister: vi.fn(),
}))

vi.mock('./use-web-push', () => ({
  useWebPush: () => webPushState,
}))

const prefs: PreferenceItem[] = [
  {
    type: 'grant_pending',
    category: 'actionRequired',
    inboxEnabled: true,
    signalREnabled: true,
    pushEnabled: true,
    mandatory: true,
  },
  {
    type: 'credential_stale',
    category: 'actionRequired',
    inboxEnabled: true,
    signalREnabled: true,
    pushEnabled: false,
    mandatory: false,
  },
]

vi.mock('./notification-queries', () => ({
  useNotificationPreferences: () => ({
    data: prefs,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateNotificationPreferences: () => ({ mutate: update, isPending: false }),
}))

import { NotificationPreferencesPage } from './notification-preferences-page'

describe('NotificationPreferencesPage', () => {
  beforeEach(() => {
    update.mockReset()
    webPushState.isSupported = true
    webPushState.status = 'registered'
  })

  it('renders a row per type with the three channel switches', () => {
    render(<NotificationPreferencesPage />)

    expect(screen.getByText('Access requests')).toBeInTheDocument()
    expect(screen.getByText('Stale credentials')).toBeInTheDocument()
    // 2 types × 3 channels = 6 switches
    expect(screen.getAllByRole('switch')).toHaveLength(6)
  })

  it('locks inbox + realtime for mandatory types (push stays mutable)', () => {
    render(<NotificationPreferencesPage />)

    const switches = screen.getAllByRole('switch')
    // grant_pending row: inbox(0) + realtime(1) locked, push(2) enabled
    expect(switches[0]).toBeDisabled()
    expect(switches[1]).toBeDisabled()
    expect(switches[2]).not.toBeDisabled()
  })

  it('persists a non-locked toggle change', () => {
    render(<NotificationPreferencesPage />)

    // credential_stale push (last switch) is mutable and currently off → enable.
    const switches = screen.getAllByRole('switch')
    fireEvent.click(switches[5])

    expect(update).toHaveBeenCalledWith(
      [{ type: 'credential_stale', pushEnabled: true }],
      expect.anything(),
    )
  })

  it('disables the push column when web push is unavailable', () => {
    webPushState.isSupported = false
    render(<NotificationPreferencesPage />)

    const switches = screen.getAllByRole('switch')
    // push columns (index 2 and 5) disabled
    expect(switches[2]).toBeDisabled()
    expect(switches[5]).toBeDisabled()
  })
})
