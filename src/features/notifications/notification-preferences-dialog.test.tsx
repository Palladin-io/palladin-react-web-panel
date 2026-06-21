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

import { NotificationPreferencesDialog } from './notification-preferences-dialog'

const onClose = vi.fn()

describe('NotificationPreferencesDialog', () => {
  beforeEach(() => {
    update.mockReset()
    onClose.mockReset()
    webPushState.isSupported = true
    webPushState.status = 'registered'
  })

  it('renders a row per type with the three channel switches', () => {
    render(<NotificationPreferencesDialog onClose={onClose} />)

    expect(screen.getByText('Access requests')).toBeInTheDocument()
    expect(screen.getByText('Stale credentials')).toBeInTheDocument()
    // 2 types × 3 channels = 6 switches
    expect(screen.getAllByRole('switch')).toHaveLength(6)
  })

  it('locks inbox + realtime for mandatory types (push stays mutable)', () => {
    render(<NotificationPreferencesDialog onClose={onClose} />)

    const switches = screen.getAllByRole('switch')
    // grant_pending row: inbox(0) + realtime(1) locked, push(2) enabled
    expect(switches[0]).toBeDisabled()
    expect(switches[1]).toBeDisabled()
    expect(switches[2]).not.toBeDisabled()
  })

  it('persists the FULL channel triple (not a partial) on a toggle change', () => {
    render(<NotificationPreferencesDialog onClose={onClose} />)

    // credential_stale push (last switch) is mutable and currently off → enable.
    // The payload must carry all three channels — a partial would be read as
    // `false` by the backend's non-nullable booleans and disable inbox/realtime.
    const switches = screen.getAllByRole('switch')
    fireEvent.click(switches[5])

    expect(update).toHaveBeenCalledWith(
      [
        {
          type: 'credential_stale',
          inboxEnabled: true,
          signalREnabled: true,
          pushEnabled: true,
        },
      ],
      expect.anything(),
    )
  })

  it('disables the push column when web push is unavailable', () => {
    webPushState.isSupported = false
    render(<NotificationPreferencesDialog onClose={onClose} />)

    const switches = screen.getAllByRole('switch')
    // push columns (index 2 and 5) disabled
    expect(switches[2]).toBeDisabled()
    expect(switches[5]).toBeDisabled()
  })
})
