import { describe, expect, it } from 'vitest'
import { isKnownNotificationType, parseNotificationPayload } from './notification-types'

const subjectId = '11112233-4455-4677-8899-aabbccddeeff'
const occurredAt = '2026-07-26T12:00:00Z'

describe('parseNotificationPayload', () => {
  it('normalizes a canonical SignalR payload and strips server presentation', () => {
    const result = parseNotificationPayload({
      subjectId,
      type: 'grant_pending',
      category: 'actionRequired',
      titleKey: 'notifications.grantPending.title',
      metadata: {
        grantId: subjectId,
        vaultId: '22222233-4455-4677-8899-aabbccddeeff',
        agentName: 'must not be trusted',
        entryLabel: 'must not be trusted',
        actionDeepLink: '/evil',
      },
      occurredAt,
    })

    expect(result).toEqual({
      subjectId,
      type: 'grant_pending',
      category: 'actionRequired',
      occurredAt,
      data: {
        grantId: subjectId,
        vaultId: '22222233-4455-4677-8899-aabbccddeeff',
      },
    })
  })

  it('accepts the thin canonical FCM data payload', () => {
    expect(parseNotificationPayload({
      subjectId, type: 'credential_stale', category: 'actionRequired', occurredAt,
    })).toEqual({
      subjectId, type: 'credential_stale', category: 'actionRequired', occurredAt, data: {},
    })
  })

  it('fails closed for legacy display payloads and malformed identifiers/timestamps', () => {
    expect(parseNotificationPayload({ type: 'grant_pending', title: 'legacy' })).toBeNull()
    expect(parseNotificationPayload({ subjectId: 'not-an-id', type: 'grant_pending', category: 'update', occurredAt })).toBeNull()
    expect(parseNotificationPayload({ subjectId, type: 'grant_pending', category: 'update', occurredAt: 'yesterday' })).toBeNull()
    expect(parseNotificationPayload(null)).toBeNull()
  })

  it('keeps an unknown type forward compatible without trusting extra copy', () => {
    const result = parseNotificationPayload({
      subjectId, type: 'future_type', category: 'update', occurredAt,
      title: 'untrusted', body: 'untrusted',
    })
    expect(result?.type).toBe('future_type')
    expect(result).not.toHaveProperty('title')
    expect(result).not.toHaveProperty('body')
  })
})

describe('isKnownNotificationType', () => {
  it('recognises known types and rejects unknown ones', () => {
    expect(isKnownNotificationType('grant_approved')).toBe(true)
    expect(isKnownNotificationType('agent_pending')).toBe(true)
    expect(isKnownNotificationType('whatever')).toBe(false)
  })
})
