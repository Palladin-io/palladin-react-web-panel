import { beforeEach, describe, expect, it, vi } from 'vitest'
import { showNotificationToast } from './notification-toast'
import type { NotificationPayload } from './notification-types'

const success = vi.hoisted(() => vi.fn())
const error = vi.hoisted(() => vi.fn())
const info = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { success, error, info } }))

function payload(type: string): NotificationPayload {
  return { type, title: 'Title', body: 'Body', data: {} }
}

describe('showNotificationToast', () => {
  beforeEach(() => {
    success.mockReset()
    error.mockReset()
    info.mockReset()
  })

  it('uses a success toast for approved grants', () => {
    showNotificationToast(payload('grant_approved'))
    expect(success).toHaveBeenCalledWith('Title', { description: 'Body' })
  })

  it('uses an error toast for denied and revoked grants', () => {
    showNotificationToast(payload('grant_denied'))
    showNotificationToast(payload('grant_revoked'))
    expect(error).toHaveBeenCalledTimes(2)
  })

  it('uses an info toast for pending/access/unknown types', () => {
    showNotificationToast(payload('grant_pending'))
    showNotificationToast(payload('agent_pending'))
    showNotificationToast(payload('credential_accessed'))
    showNotificationToast(payload('future_type'))
    expect(info).toHaveBeenCalledTimes(4)
  })
})
