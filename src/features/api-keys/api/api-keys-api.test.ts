import { describe, expect, it } from 'vitest'
import { normalizeApiKeyStatus } from './api-keys-api'

describe('api-keys-api', () => {
  it('normalizes supported wire variants without reclassifying a future status', () => {
    expect(normalizeApiKeyStatus(1)).toBe('active')
    expect(normalizeApiKeyStatus(2)).toBe('revoked')
    expect(normalizeApiKeyStatus('suspending')).toBe('suspending')
    expect(normalizeApiKeyStatus(3)).toBe('unknown')
  })
})
