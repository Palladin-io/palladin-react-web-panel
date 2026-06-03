import { describe, expect, it } from 'vitest'
import {
  isKnownNotificationType,
  parseNotificationPayload,
} from './notification-types'

describe('parseNotificationPayload', () => {
  it('parses a well-formed payload and defaults data to {}', () => {
    const result = parseNotificationPayload({
      type: 'grant_pending',
      title: 'New grant request',
      body: 'Agent X requested access',
    })
    expect(result).not.toBeNull()
    expect(result?.type).toBe('grant_pending')
    expect(result?.data).toEqual({})
  })

  it('keeps the data id map', () => {
    const result = parseNotificationPayload({
      type: 'credential_accessed',
      title: 'Accessed',
      body: 'An entry was read',
      data: { vaultId: 'v1', entryId: 'e1' },
    })
    expect(result?.data).toEqual({ vaultId: 'v1', entryId: 'e1' })
  })

  it('returns null for a malformed payload instead of throwing', () => {
    expect(parseNotificationPayload({ title: 'no type' })).toBeNull()
    expect(parseNotificationPayload(null)).toBeNull()
    expect(parseNotificationPayload('nope')).toBeNull()
  })

  it('accepts an unknown type string (forward compatible)', () => {
    const result = parseNotificationPayload({
      type: 'some_future_type',
      title: 'T',
      body: 'B',
    })
    expect(result?.type).toBe('some_future_type')
  })
})

describe('isKnownNotificationType', () => {
  it('recognises known types', () => {
    expect(isKnownNotificationType('grant_approved')).toBe(true)
    expect(isKnownNotificationType('agent_pending')).toBe(true)
  })

  it('rejects unknown types', () => {
    expect(isKnownNotificationType('whatever')).toBe(false)
  })
})
