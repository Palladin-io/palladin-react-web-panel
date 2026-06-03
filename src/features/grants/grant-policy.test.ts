import { describe, expect, it } from 'vitest'
import { grantPolicyToBody, validateGrantPolicy } from './grant-policy'

const NOW = new Date('2026-06-03T12:00:00Z')

describe('validateGrantPolicy', () => {
  it('accepts a future expiry', () => {
    expect(
      validateGrantPolicy(
        { kind: 'expiry', expiresAt: '2026-06-04T12:00', queryLimit: '' },
        NOW,
      ),
    ).toBeNull()
  })

  it('rejects a missing expiry', () => {
    expect(
      validateGrantPolicy({ kind: 'expiry', expiresAt: '', queryLimit: '' }, NOW),
    ).toBe('expiryRequired')
  })

  it('rejects an expiry in the past', () => {
    expect(
      validateGrantPolicy(
        { kind: 'expiry', expiresAt: '2026-06-01T12:00', queryLimit: '' },
        NOW,
      ),
    ).toBe('expiryInPast')
  })

  it('accepts a positive integer limit', () => {
    expect(
      validateGrantPolicy({ kind: 'limit', expiresAt: '', queryLimit: '5' }, NOW),
    ).toBeNull()
  })

  it('rejects a missing limit', () => {
    expect(
      validateGrantPolicy({ kind: 'limit', expiresAt: '', queryLimit: '' }, NOW),
    ).toBe('limitRequired')
  })

  it('rejects a non-integer or non-positive limit', () => {
    expect(
      validateGrantPolicy({ kind: 'limit', expiresAt: '', queryLimit: '0' }, NOW),
    ).toBe('limitInvalid')
    expect(
      validateGrantPolicy({ kind: 'limit', expiresAt: '', queryLimit: '2.5' }, NOW),
    ).toBe('limitInvalid')
    expect(
      validateGrantPolicy({ kind: 'limit', expiresAt: '', queryLimit: 'abc' }, NOW),
    ).toBe('limitInvalid')
  })
})

describe('grantPolicyToBody — XOR mapping', () => {
  it('maps expiry to an ISO expiresAt only', () => {
    const body = grantPolicyToBody({
      kind: 'expiry',
      expiresAt: '2026-06-04T12:00',
      queryLimit: '99',
    })
    expect(body).toHaveProperty('expiresAt')
    expect(body).not.toHaveProperty('queryLimit')
    expect((body as { expiresAt: string }).expiresAt).toMatch(/^2026-06-04T/)
  })

  it('maps limit to a numeric queryLimit only', () => {
    const body = grantPolicyToBody({
      kind: 'limit',
      expiresAt: '2026-06-04T12:00',
      queryLimit: '3',
    })
    expect(body).toEqual({ queryLimit: 3 })
    expect(body).not.toHaveProperty('expiresAt')
  })
})
