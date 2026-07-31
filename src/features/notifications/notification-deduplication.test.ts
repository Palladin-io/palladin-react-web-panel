import { beforeEach, describe, expect, it } from 'vitest'
import {
  claimNotificationEvent,
  resetNotificationDeduplicationForTests,
} from './notification-deduplication'
import type { NotificationPayload } from './notification-types'

const payload: NotificationPayload = {
  subjectId: '11112233-4455-4677-8899-aabbccddeeff',
  type: 'grant_pending',
  category: 'actionRequired',
  occurredAt: '2026-07-26T12:00:00Z',
  data: {},
}

describe('claimNotificationEvent', () => {
  beforeEach(resetNotificationDeduplicationForTests)

  it('claims the same logical SignalR/FCM event once and allows a later occurrence', () => {
    expect(claimNotificationEvent(payload, 1_000)).toBe(true)
    expect(claimNotificationEvent({ ...payload, data: { vaultId: 'ignored-in-key' } }, 1_001)).toBe(false)
    expect(claimNotificationEvent({ ...payload, occurredAt: '2026-07-26T12:00:01Z' }, 1_002)).toBe(true)
  })

  it('expires old claims instead of retaining an unbounded session history', () => {
    expect(claimNotificationEvent(payload, 1_000)).toBe(true)
    expect(claimNotificationEvent(payload, 121_001)).toBe(true)
  })
})
