import { describe, expect, it } from 'vitest'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY, normalizeEntryType } from './types'

describe('normalizeEntryType', () => {
  // The backend serialises EntryType as a camelCase string via
  // JsonStringEnumConverter — the wire value is "key"/"credential", never 0/1.
  it('maps the string wire values to the numeric constants', () => {
    expect(normalizeEntryType('key')).toBe(ENTRY_TYPE_KEY)
    expect(normalizeEntryType('credential')).toBe(ENTRY_TYPE_CREDENTIAL)
  })

  it('is case-insensitive for the string form', () => {
    expect(normalizeEntryType('Key')).toBe(ENTRY_TYPE_KEY)
    expect(normalizeEntryType('CREDENTIAL')).toBe(ENTRY_TYPE_CREDENTIAL)
  })

  it('passes numeric forms through unchanged (older builds / fixtures)', () => {
    expect(normalizeEntryType(0)).toBe(ENTRY_TYPE_KEY)
    expect(normalizeEntryType(1)).toBe(ENTRY_TYPE_CREDENTIAL)
  })

  it('defaults unknown values to CREDENTIAL rather than throwing', () => {
    expect(normalizeEntryType(undefined)).toBe(ENTRY_TYPE_CREDENTIAL)
    expect(normalizeEntryType('nonsense')).toBe(ENTRY_TYPE_CREDENTIAL)
  })
})
