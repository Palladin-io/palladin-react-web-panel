import { render, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import { NotificationCard } from './notification-card'
import { showNotificationToast } from './notification-toast'
import { notificationOpenTarget, notificationDeepLink, resolveNotificationItem } from './notification-resolution'
import type { NotificationItem } from './notifications-api'
import { parseNotificationPayload, sanitizeNotificationMetadata } from './notification-types'

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const submissionId = '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d'
const agentId = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b'

const pending: NotificationItem = {
  id: 'n1', type: 'submission_pending', category: 'actionRequired', titleKey: 'ignored',
  metadata: { submissionId }, occurredAt: '2026-10-29T08:00:00Z', readAt: null, actionState: 'pending',
}

describe('agent submission notifications', () => {
  it('keeps only the opaque submission reference from the wire', () => {
    expect(sanitizeNotificationMetadata({ submissionId, agentName: 'spoofed', host: 'evil' })).toEqual({ submissionId })
    expect(sanitizeNotificationMetadata({ submissionId: '../../vaults' })).toEqual({})
  })

  it('resolves the card from the authorized submissions list and localises it', () => {
    const resolved = resolveNotificationItem(pending, {
      vaults: new Map(), agents: new Map(),
      submissions: new Map([[submissionId, { agentId, agentName: 'Deploy Bot', submissionKind: 2, entryType: 1 }]]),
    })
    render(<NotificationCard item={resolved} />)
    expect(screen.getByText('Agent submission')).toBeInTheDocument()
    expect(screen.getByText('Deploy Bot proposed a secret')).toBeInTheDocument()
    expect(screen.getByText('Password update')).toBeInTheDocument()
    expect(screen.getByText('Credential')).toBeInTheDocument()
    expect(screen.getByText('0d0d0d0d…0d0d0d')).toBeInTheDocument()
  })

  it('renders an unresolved card with neutral placeholders instead of hiding it', () => {
    render(<NotificationCard item={pending} />)
    expect(screen.getByText('Agent submission')).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('routes the card, toast and push to the decision view only for pending submissions', () => {
    expect(notificationDeepLink(pending)).toEqual({ to: '/submissions/$submissionId', params: { submissionId } })
    expect(notificationDeepLink({ ...pending, type: 'submission_resolved' })).toBeNull()
    const payload = parseNotificationPayload({
      subjectId: submissionId, type: 'submission_pending', category: 'actionRequired',
      metadata: { submissionId }, occurredAt: '2026-10-29T08:00:00Z',
    })!
    expect(notificationOpenTarget(payload)).toEqual({ to: '/submissions/$submissionId', params: { submissionId } })
    expect(notificationOpenTarget({ ...payload, data: {} })).toEqual({ to: '/submissions/$submissionId', params: { submissionId } })
    expect(notificationOpenTarget({ ...payload, type: 'grant_pending' })).toEqual({ to: '/inbox' })
  })

  it('pops a generic local toast for a pending submission and none for its resolution', () => {
    const payload = parseNotificationPayload({
      subjectId: submissionId, type: 'submission_pending', category: 'actionRequired', occurredAt: '2026-10-29T08:00:00Z',
    })!
    showNotificationToast(payload)
    expect(toast.info).toHaveBeenCalledWith('Agent submission waiting', expect.anything())
    vi.mocked(toast.info).mockClear()
    showNotificationToast({ ...payload, type: 'submission_resolved' })
    expect(toast.info).not.toHaveBeenCalled()
  })
})
