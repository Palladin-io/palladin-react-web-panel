import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { SharedUnlockLinkSection } from './shared-unlock-link-section'
import { useSharedUnlockLink } from '../use-shared-unlock-link'

vi.mock('../use-shared-unlock-link', () => ({ useSharedUnlockLink: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
const act = vi.fn(), refetch = vi.fn()
const marker = { version: 1 as const, apiUrl: 'https://api.test', webOrigin: 'https://web.test', extensionId: 'a'.repeat(32),
  accountId: '11111111-1111-4111-8111-111111111111', linkId: '22222222-2222-4222-8222-222222222222', observed: null, pending: [], disconnectId: null }
function state(options: { configured?: boolean; disconnected?: boolean; missing?: boolean } = {}) {
  vi.mocked(useSharedUnlockLink).mockReturnValue({ configured: options.configured ?? true, act,
    link: { data: options.missing ? null : { ...marker, disconnectId: options.disconnected ? '33333333-3333-4333-8333-333333333333' : null },
      isPending: false, isError: false, refetch } as unknown as ReturnType<typeof useSharedUnlockLink>['link'] })
}
beforeEach(() => { act.mockReset().mockResolvedValue(undefined); refetch.mockReset().mockResolvedValue(undefined); state() })
afterEach(() => vi.clearAllMocks())

it('requires confirmation, permits cancel and restores focus without changing pairing', async () => {
  render(<SharedUnlockLinkSection />)
  const trigger = screen.getByRole('button', { name: 'Disconnect this browser' }); trigger.focus(); fireEvent.click(trigger)
  const dialog = screen.getByRole('dialog', { name: 'Disconnect this browser' })
  expect(within(dialog).getByText(/Other devices and your account setting stay unchanged/)).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(act).not.toHaveBeenCalled()
  await waitFor(() => expect(trigger).toHaveFocus())
})

it('confirms a single own-scope disconnect and does not expose internal identifiers', async () => {
  render(<SharedUnlockLinkSection />)
  expect(document.body.textContent).not.toContain(marker.linkId)
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect this browser' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Disconnect this browser' }))
  expect(act).toHaveBeenCalledExactlyOnceWith('disconnect', marker.linkId)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(toast.error).not.toHaveBeenCalled()
})

it('offers explicit reconnect for a retained local revocation and explains the fresh unlock', async () => {
  state({ disconnected: true }); render(<SharedUnlockLinkSection />)
  expect(screen.getByText('Browser disconnected.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(/unlock it again to start a new verified pairing/)).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reconnect' }))
  await waitFor(() => expect(act).toHaveBeenCalledExactlyOnceWith('reconnect', marker.linkId))
})

it('reports failure without a success claim or exposing the transport error', async () => {
  act.mockRejectedValue(new Error('synthetic transport detail'))
  render(<SharedUnlockLinkSection />); fireEvent.click(screen.getByRole('button', { name: 'Disconnect this browser' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Disconnect this browser' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The pairing action could not be completed. Check the saved state before trying again.'))
})

it.each([{ configured: false, missing: true }, { missing: true }])('does not invent a pairing or first-use consent when no usable local record exists', options => {
  state(options); render(<SharedUnlockLinkSection />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(act).not.toHaveBeenCalled()
})
