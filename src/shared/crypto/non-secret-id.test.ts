import { describe, expect, it } from 'vitest'
import { deriveNonSecretStableId } from './non-secret-id'

describe('deriveNonSecretStableId', () => {
  it('is stable and does not expose its source values', async () => {
    const first = await deriveNonSecretStableId('benefit', 'user-1', '2026-08-25T12:00:00Z')
    const second = await deriveNonSecretStableId('benefit', 'user-1', '2026-08-25T12:00:00Z')
    const different = await deriveNonSecretStableId('benefit', 'user-2', '2026-08-25T12:00:00Z')

    expect(first).toBe(second)
    expect(first).not.toBe(different)
    expect(first).toMatch(/^v1\.[A-Za-z0-9_-]{43}$/)
    expect(first).not.toContain('2026')
    expect(first).not.toContain('user-1')
  })
})
