import { describe, expect, it } from 'vitest'
import { grantPolicyToBody, validateGrantPolicy } from './grant-policy'

const NOW = new Date('2026-06-03T12:00:00Z')

describe('validateGrantPolicy', () => {
  it('accepts a future expiry (time)', () => {
    expect(
      validateGrantPolicy(
        { kind: 'time', expiresAt: '2026-06-04T12:00', queryLimit: '' },
        NOW,
      ),
    ).toBeNull()
  })

  it('rejects a missing expiry', () => {
    expect(
      validateGrantPolicy({ kind: 'time', expiresAt: '', queryLimit: '' }, NOW),
    ).toBe('expiryRequired')
  })

  it('rejects an expiry in the past', () => {
    expect(
      validateGrantPolicy(
        { kind: 'time', expiresAt: '2026-06-01T12:00', queryLimit: '' },
        NOW,
      ),
    ).toBe('expiryInPast')
  })

  it('accepts a positive integer limit (uses)', () => {
    expect(
      validateGrantPolicy({ kind: 'uses', expiresAt: '', queryLimit: '5' }, NOW),
    ).toBeNull()
  })

  it('rejects a missing limit', () => {
    expect(
      validateGrantPolicy({ kind: 'uses', expiresAt: '', queryLimit: '' }, NOW),
    ).toBe('limitRequired')
  })

  it('rejects a non-integer or non-positive limit', () => {
    expect(
      validateGrantPolicy({ kind: 'uses', expiresAt: '', queryLimit: '0' }, NOW),
    ).toBe('limitInvalid')
    expect(
      validateGrantPolicy({ kind: 'uses', expiresAt: '', queryLimit: '2.5' }, NOW),
    ).toBe('limitInvalid')
    expect(
      validateGrantPolicy({ kind: 'uses', expiresAt: '', queryLimit: 'abc' }, NOW),
    ).toBe('limitInvalid')
  })

  it('always accepts lifetime (no extra field required)', () => {
    expect(
      validateGrantPolicy({ kind: 'lifetime', expiresAt: '', queryLimit: '' }, NOW),
    ).toBeNull()
  })
})

describe('grantPolicyToBody — XOR-or-none mapping', () => {
  it('maps time to an ISO expiresAt only', () => {
    const body = grantPolicyToBody({
      kind: 'time',
      expiresAt: '2026-06-04T12:00',
      queryLimit: '99',
    })
    expect(body).toHaveProperty('expiresAt')
    expect(body).not.toHaveProperty('queryLimit')
    expect((body as { expiresAt: string }).expiresAt).toMatch(/^2026-06-04T/)
  })

  it('maps uses to a numeric queryLimit only', () => {
    const body = grantPolicyToBody({
      kind: 'uses',
      expiresAt: '2026-06-04T12:00',
      queryLimit: '3',
    })
    expect(body).toEqual({ queryLimit: 3 })
    expect(body).not.toHaveProperty('expiresAt')
  })

  it('maps lifetime to an empty body (neither field)', () => {
    const body = grantPolicyToBody({
      kind: 'lifetime',
      expiresAt: '2026-06-04T12:00',
      queryLimit: '99',
    })
    expect(body).toEqual({})
    expect(body).not.toHaveProperty('expiresAt')
    expect(body).not.toHaveProperty('queryLimit')
  })
})
