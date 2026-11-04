import { describe, expect, it } from 'vitest'
import {
  SIGN_IN_METHOD_FIELD_TYPE,
  hasRecognizedSignInMethod,
  isProviderAccountDomain,
  normalizeSignInAccount,
  parseSignInBinding,
  readSignInMethod,
  replaceSignInMethod,
} from './sign-in-method'
import type { CustomField } from './types'

const VAULT_ID = '0b5e8f0c-1d2a-4c3b-8e4f-5a6b7c8d9e0f'
const ENTRY_ID = '7c1d2e3f-4a5b-4c6d-9e7f-8091a2b3c4d5'
const entry = { vaultId: VAULT_ID, entryId: ENTRY_ID }

function field(id: string, value: unknown, type = SIGN_IN_METHOD_FIELD_TYPE): CustomField {
  return { id, label: 'Sign-in method', type, value: value as CustomField['value'] }
}

const text: CustomField = { id: 'text-1', label: 'Recovery', type: 'text', value: 'abc' }

describe('parseSignInBinding', () => {
  it.each([
    [{ provider: 'google', account: 'alice@example.com', entry }],
    [{ provider: 'apple', account: null, entry: null }],
    [{ provider: 'microsoft', account: 'a'.repeat(256), entry: null }],
    [{ entry: null, account: 'octocat', provider: 'github' }],
    [{ provider: 'facebook', account: 'Zoë', entry }],
  ])('recognizes %j', (value) => {
    expect(parseSignInBinding(value)).toEqual({ provider: value.provider, account: value.account, entry: value.entry })
  })

  it.each([
    ['the retired two-key shape', { provider: 'google', account: 'alice@example.com' }],
    ['unknown provider', { provider: 'twitter', account: null, entry: null }],
    ['provider case', { provider: 'Google', account: null, entry: null }],
    ['missing entry', { provider: 'google', account: null }],
    ['extra key', { provider: 'google', account: null, entry: null, verified: true }],
    ['empty account', { provider: 'google', account: '', entry: null }],
    ['untrimmed account', { provider: 'google', account: ' alice ', entry: null }],
    ['non-NFC account', { provider: 'google', account: 'Zoë', entry: null }],
    ['too long account', { provider: 'google', account: 'a'.repeat(257), entry: null }],
    ['uppercase entry id', { provider: 'google', account: null, entry: { vaultId: VAULT_ID.toUpperCase(), entryId: ENTRY_ID } }],
    ['entry with extra key', { provider: 'google', account: null, entry: { ...entry, label: 'x' } }],
    ['entry missing vault', { provider: 'google', account: null, entry: { entryId: ENTRY_ID } }],
    ['string entry', { provider: 'google', account: null, entry: ENTRY_ID }],
    ['array', ['google', null, null]],
    ['null', null],
  ])('rejects %s', (_, value) => {
    expect(parseSignInBinding(value)).toBeNull()
  })
})

describe('readSignInMethod', () => {
  it('reports none, recognized, unrecognized and ambiguous states', () => {
    expect(readSignInMethod([text])).toEqual({ kind: 'none' })
    expect(readSignInMethod([text, field('a', { provider: 'google', account: null, entry: null })])).toEqual({
      kind: 'recognized', fieldId: 'a', binding: { provider: 'google', account: null, entry: null },
    })
    expect(readSignInMethod([field('a', { provider: 'google', account: 'x' })]))
      .toEqual({ kind: 'unrecognized', fieldId: 'a' })
    expect(readSignInMethod([
      field('a', { provider: 'google', account: 'x', entry: null }),
      field('b', { provider: 'apple', account: null, entry: null }),
    ])).toEqual({ kind: 'ambiguous', fieldIds: ['a', 'b'] })
  })
})

describe('hasRecognizedSignInMethod', () => {
  it('is true only for exactly one recognized binding', () => {
    const recognized = field('a', { provider: 'google', account: null, entry: null })
    expect(hasRecognizedSignInMethod([text, recognized])).toBe(true)
    expect(hasRecognizedSignInMethod([text])).toBe(false)
    expect(hasRecognizedSignInMethod([field('a', { provider: 'google', account: null })])).toBe(false)
    expect(hasRecognizedSignInMethod([recognized, field('b', { provider: 'apple', account: null, entry: null })])).toBe(false)
  })
})

describe('isProviderAccountDomain', () => {
  it.each([
    ['google', 'accounts.google.com', true],
    ['google', 'google.com', true],
    ['google', 'google.co.uk', false],
    ['google', 'notgoogle.com', false],
    ['apple', 'appleid.apple.com', true],
    ['microsoft', 'login.live.com', true],
    ['microsoft', 'login.microsoftonline.com', true],
    ['microsoft', 'account.microsoft.com', true],
    ['microsoft', 'github.com', false],
    ['github', 'github.com', true],
    ['github', 'github.io', false],
    ['facebook', 'www.facebook.com', true],
    ['google', null, false],
  ] as const)('%s / %s → %s', (provider, urlDomain, expected) => {
    expect(isProviderAccountDomain(provider, urlDomain)).toBe(expected)
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
    const next = replaceSignInMethod([text], { provider: 'github', account: 'octocat', entry }, 'Metoda logowania')
    expect(next).toHaveLength(2)
    expect(next[0]).toBe(text)
    expect(next[1]).toMatchObject({
      label: 'Metoda logowania', type: SIGN_IN_METHOD_FIELD_TYPE, value: { provider: 'github', account: 'octocat', entry },
    })
    expect(next[1].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('edits a single recognized binding in place, keeping id, label and position', () => {
    const existing = { ...field('keep', { provider: 'google', account: null, entry: null }), label: 'Custom label' }
    const next = replaceSignInMethod([existing, text], { provider: 'apple', account: 'me', entry: null }, 'Sign-in method')
    expect(next).toEqual([{ ...existing, value: { provider: 'apple', account: 'me', entry: null } }, text])
  })

  it('replaces ambiguous and retired bindings with exactly one new field', () => {
    const fields = [
      text,
      field('a', { provider: 'google', account: 'x', entry: null }),
      field('b', { provider: 'google', account: 'x' }),
    ]
    const next = replaceSignInMethod(fields, { provider: 'microsoft', account: null, entry: null }, 'Sign-in method')
    expect(next).toHaveLength(2)
    expect(next[0]).toBe(text)
    expect(next[1].id).not.toBe('a')
    expect(next[1].value).toEqual({ provider: 'microsoft', account: null, entry: null })
  })

  it('removes every binding and leaves other fields untouched', () => {
    const fields = [field('a', { provider: 'google', account: null, entry: null }), text, field('b', 'garbage')]
    expect(replaceSignInMethod(fields, null, 'Sign-in method')).toEqual([text])
  })
})
