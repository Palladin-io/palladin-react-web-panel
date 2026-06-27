import { describe, expect, it } from 'vitest'
import { csvParam } from './filter-params'

describe('csvParam', () => {
  it('omits the param (undefined) for an empty selection', () => {
    expect(csvParam([])).toBeUndefined()
  })

  it('passes a single value through unchanged', () => {
    expect(csvParam(['vault.created'])).toBe('vault.created')
  })

  it('joins multiple values with commas for an IN filter', () => {
    expect(csvParam(['vault.created', 'org.created'])).toBe('vault.created,org.created')
    expect(csvParam(['a', 'b', 'c'])).toBe('a,b,c')
  })
})
