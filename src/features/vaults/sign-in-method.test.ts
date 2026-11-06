import { describe, expect, it } from 'vitest'
import {
  SIGN_IN_METHOD_FIELD_TYPE,
  hasRecognizedSignInMethod,
  isProviderAccountDomain,
  normalizeSignInAccount,
  parseSignInBinding,
  updateSignInMethod,
  readSignInMethods,
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

describe('hasRecognizedSignInMethod', () => {
  it('accepts one or more recognized methods', () => {
    const recognized = field('a', { provider: 'google', account: null, entry: null })
    expect(hasRecognizedSignInMethod([text, recognized])).toBe(true)
    expect(hasRecognizedSignInMethod([text])).toBe(false)
    expect(hasRecognizedSignInMethod([field('a', { provider: 'google', account: null })])).toBe(false)
    expect(hasRecognizedSignInMethod([recognized, field('b', { provider: 'apple', account: null, entry: null })])).toBe(true)
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

describe('method collection editing', () => {
  it('adds same-provider accounts and edits/removes only the chosen stable ID', () => {
    const first = field('ABC', { provider: 'google', account: 'personal', entry: null }, 'palladin.signin.v1')
    const opaque = field('opaque', { future: true }, 'palladin.signin.v99')
    const second = field('second', { provider: 'google', account: 'work', entry: null }, 'palladin.signin.v2')
    const original = [first, text, opaque, second]
    expect(readSignInMethods(original)).toHaveLength(2)
    const edited = updateSignInMethod(original, 'ABC', { provider: 'apple', account: null, entry: null }, 'new')
    expect(edited).toEqual([{ ...first, type: 'palladin.signin.v2', value: { provider: 'apple', account: null, entry: null } }, text, opaque, second])
    expect(updateSignInMethod(edited, 'second', null, '')).toEqual(edited.slice(0, 3))
    const added = updateSignInMethod(original, null, { provider: 'google', account: 'third', entry: null }, 'new')
    expect(added.slice(0, 4)).toEqual(original)
    expect(added[4].type).toBe('palladin.signin.v2')
    expect(hasRecognizedSignInMethod(added)).toBe(true)
    expect(updateSignInMethod([second], 'second', null, '')).toEqual([])
  })
  it('preserves malformed and future fields when an unknown ID is edited', () => {
    const opaque = field('opaque', { provider: 'google', future: true }, 'palladin.signin.v2')
    expect(updateSignInMethod([opaque], 'missing', { provider: 'google', account: null, entry: null }, '')).toEqual([opaque])
    expect(readSignInMethods([opaque])).toEqual([])
    const future = field('future', { provider: 'google', account: null, entry: null }, 'palladin.signin.v99')
    expect(readSignInMethods([future])).toEqual([])
    expect(hasRecognizedSignInMethod([future])).toBe(false)
  })
})
