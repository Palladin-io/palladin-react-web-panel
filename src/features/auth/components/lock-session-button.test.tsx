import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LockSessionButton } from './lock-session-button'
import { lockClientSession } from '../session/manual-lock'
import { toast } from 'sonner'

vi.mock('../session/manual-lock', () => ({ lockClientSession: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
afterEach(() => vi.clearAllMocks())
it('exposes the accessible manual action and runs it once without claiming peer success', () => {
  vi.mocked(lockClientSession).mockResolvedValue()
  render(<LockSessionButton />)
  fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
  expect(lockClientSession).toHaveBeenCalledOnce(); expect(toast.error).not.toHaveBeenCalled()
})
it('reports a failed shared closing without rendering raw errors', async () => {
  vi.mocked(lockClientSession).mockRejectedValue(new Error('synthetic internal detail'))
  render(<LockSessionButton />); fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This panel is locked. The shared lock could not be completed.'))
})
