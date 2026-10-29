import { describe, expect, it } from 'vitest'
import {
  SIGN_IN_METHOD_FIELD_TYPE,
  hasRecognizedSignInMethod,
  normalizeSignInAccount,
  parseSignInBinding,
  readSignInMethod,
  replaceSignInMethod,
} from './sign-in-method'
import type { CustomField } from './types'

function field(id: string, value: unknown, type = SIGN_IN_METHOD_FIELD_TYPE): CustomField {
  return { id, label: 'Sign-in method', type, value: value as CustomField['value'] }
}

const text: CustomField = { id: 'text-1', label: 'Recovery', type: 'text', value: 'abc' }

describe('parseSignInBinding', () => {
  it.each([
    [{ provider: 'google', account: 'alice@example.com' }],
    [{ provider: 'apple', account: null }],
    [{ provider: 'microsoft', account: 'a'.repeat(256) }],
    [{ account: 'octocat', provider: 'github' }],
    [{ provider: 'facebook', account: 'Zoë' }],
  ])('recognizes %j', (value) => {
    expect(parseSignInBinding(value)).toEqual({ provider: value.provider, account: value.account })
  })

  it.each([
    ['unknown provider', { provider: 'twitter', account: null }],
    ['provider case', { provider: 'Google', account: null }],
    ['missing account', { provider: 'google' }],
    ['extra key', { provider: 'google', account: null, verified: true }],
    ['empty account', { provider: 'google', account: '' }],
    ['untrimmed account', { provider: 'google', account: ' alice ' }],
    ['non-NFC account', { provider: 'google', account: 'Zoë' }],
    ['too long account', { provider: 'google', account: 'a'.repeat(257) }],
    ['numeric account', { provider: 'google', account: 7 }],
    ['array', ['google', null]],
    ['string', 'google'],
    ['null', null],
  ])('rejects %s', (_, value) => {
    expect(parseSignInBinding(value)).toBeNull()
  })
})

describe('readSignInMethod', () => {
  it('reports none, recognized, unrecognized and ambiguous states', () => {
    expect(readSignInMethod([text])).toEqual({ kind: 'none' })
    expect(readSignInMethod([text, field('a', { provider: 'google', account: null })])).toEqual({
      kind: 'recognized', fieldId: 'a', binding: { provider: 'google', account: null },
    })
    expect(readSignInMethod([field('a', { provider: 'myspace', account: null })]))
      .toEqual({ kind: 'unrecognized', fieldId: 'a' })
    expect(readSignInMethod([
      field('a', { provider: 'google', account: 'x' }),
      field('b', { provider: 'apple', account: null }),
    ])).toEqual({ kind: 'ambiguous', fieldIds: ['a', 'b'] })
  })
})

describe('normalizeSignInAccount', () => {
  it('trims, applies NFC and maps empty or oversize input to null', () => {
    expect(normalizeSignInAccount('  Zoë@example.com ')).toBe('Zoë@example.com')
    expect(normalizeSignInAccount('   ')).toBeNull()
    expect(normalizeSignInAccount('a'.repeat(257))).toBeNull()
  })
})

describe('replaceSignInMethod', () => {
  it('adds one binding with the given label when none exists', () => {
    const next = replaceSignInMethod([text], { provider: 'github', account: 'octocat' }, 'Metoda logowania')
    expect(next).toHaveLength(2)
    expect(next[0]).toBe(text)
    expect(next[1]).toMatchObject({
      label: 'Metoda logowania', type: SIGN_IN_METHOD_FIELD_TYPE, value: { provider: 'github', account: 'octocat' },
    })
    expect(next[1].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('edits a single recognized binding in place, keeping id, label and position', () => {
    const existing = { ...field('keep', { provider: 'google', account: null }), label: 'Custom label' }
    const next = replaceSignInMethod([existing, text], { provider: 'apple', account: 'me' }, 'Sign-in method')
    expect(next).toEqual([{ ...existing, value: { provider: 'apple', account: 'me' } }, text])
  })

  it('replaces ambiguous and unrecognized bindings with exactly one new field', () => {
    const fields = [
      text,
      field('a', { provider: 'google', account: 'x' }),
      field('b', { provider: 'nope', account: null }),
    ]
    const next = replaceSignInMethod(fields, { provider: 'microsoft', account: null }, 'Sign-in method')
    expect(next).toHaveLength(2)
    expect(next[0]).toBe(text)
    expect(next[1].id).not.toBe('a')
    expect(next[1].value).toEqual({ provider: 'microsoft', account: null })
  })

  it('removes every binding and leaves other fields untouched', () => {
    const fields = [field('a', { provider: 'google', account: null }), text, field('b', 'garbage')]
    expect(replaceSignInMethod(fields, null, 'Sign-in method')).toEqual([text])
  })
})

describe('hasRecognizedSignInMethod', () => {
  it('is true only for exactly one recognized binding', () => {
    const recognized = field('a', { provider: 'google', account: null })
    expect(hasRecognizedSignInMethod([text, recognized])).toBe(true)
    expect(hasRecognizedSignInMethod([text])).toBe(false)
    expect(hasRecognizedSignInMethod([field('a', { provider: 'google' })])).toBe(false)
    expect(hasRecognizedSignInMethod([recognized, field('b', { provider: 'apple', account: null })])).toBe(false)
  })
})
