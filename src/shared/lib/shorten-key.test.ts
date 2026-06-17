import { describe, expect, it } from 'vitest'
import { shortenKey } from './shorten-key'

describe('shortenKey', () => {
  it('shortens a long value to prefix…suffix (defaults 8 + 6)', () => {
    const key = 'MCowBQYDK2VwAyEAabcdefghijklmnopqrstuvwxyzEd3k='
    expect(shortenKey(key)).toBe('MCowBQYD…zEd3k=')
  })

  it('honours custom prefix/suffix lengths', () => {
    expect(shortenKey('0123456789abcdef', 4, 4)).toBe('0123…cdef')
  })

  it('returns the value unchanged when shortening would not save space', () => {
    expect(shortenKey('short', 8, 6)).toBe('short')
    // exactly prefix + suffix + 1 (the ellipsis) → no saving, keep as-is
    expect(shortenKey('abcdefghijklmno', 8, 6)).toBe('abcdefghijklmno')
  })

  it('always keeps a suffix (never prefix-only)', () => {
    const out = shortenKey('agent_1234567890_abcdef', 6, 4)
    expect(out.startsWith('agent_')).toBe(true)
    expect(out.endsWith('cdef')).toBe(true)
    expect(out).toContain('…')
  })

  it('rejects negative lengths', () => {
    expect(() => shortenKey('x', -1, 2)).toThrow()
  })
})
