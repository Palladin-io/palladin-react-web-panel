import { describe, it, expect } from 'vitest'
import { parseGrantMethods, serializeGrantMethods } from './grant-methods'

describe('parseGrantMethods', () => {
  it('parses a combined-flags string', () => {
    expect(parseGrantMethods('get, exec')).toEqual(['get', 'exec'])
  })

  it('is case- and whitespace-insensitive and canonically ordered', () => {
    expect(parseGrantMethods('Inject,  GET')).toEqual(['get', 'inject'])
  })

  it('skips unknown tokens', () => {
    expect(parseGrantMethods('get, frobnicate')).toEqual(['get'])
  })

  it('de-duplicates', () => {
    expect(parseGrantMethods('exec, exec')).toEqual(['exec'])
  })

  it('returns [] for null/empty', () => {
    expect(parseGrantMethods(null)).toEqual([])
    expect(parseGrantMethods('')).toEqual([])
    expect(parseGrantMethods(undefined)).toEqual([])
  })
})

describe('serializeGrantMethods', () => {
  it('serialises to PascalCase combined flags in canonical order', () => {
    expect(serializeGrantMethods(['exec', 'get'])).toBe('Get, Exec')
    expect(serializeGrantMethods(['inject'])).toBe('Inject')
    expect(serializeGrantMethods(['get', 'exec', 'inject'])).toBe('Get, Exec, Inject')
  })

  it('round-trips with parseGrantMethods', () => {
    const methods = ['exec', 'inject'] as const
    expect(parseGrantMethods(serializeGrantMethods([...methods]).toLowerCase())).toEqual([
      'exec',
      'inject',
    ])
  })
})
