import { describe, expect, it } from 'vitest'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY } from '../types'
import { extractDomain } from '../components/entry-presentation'
import { normalizeEntry, normalizeTotp } from './normalize'

describe('normalizeTotp', () => {
  it('passes a full otpauth URI through untouched', () => {
    const uri = 'otpauth://totp/GitHub:octocat?secret=JBSWY3DPEHPK3PXP&issuer=GitHub'
    expect(normalizeTotp(uri, 'GitHub', 'github.com')).toBe(uri)
  })

  it('wraps a bare Base32 secret into an otpauth URI with issuer host', () => {
    const result = normalizeTotp('jbswy3dpehpk3pxp', 'GitHub', 'github.com')
    expect(result).toMatch(/^otpauth:\/\/totp\/GitHub\?/)
    expect(result).toContain('secret=JBSWY3DPEHPK3PXP')
    expect(result).toContain('issuer=github.com')
  })

  it('strips grouping spaces from a bare secret', () => {
    const result = normalizeTotp('JBSW Y3DP EHPK 3PXP', 'Acme', undefined)
    expect(result).toContain('secret=JBSWY3DPEHPK3PXP')
  })

  it('returns undefined for empty or non-Base32 junk', () => {
    expect(normalizeTotp('', 'x', undefined)).toBeUndefined()
    expect(normalizeTotp('   ', 'x', undefined)).toBeUndefined()
    expect(normalizeTotp('not a secret!!', 'x', undefined)).toBeUndefined()
  })
})

describe('normalizeEntry', () => {
  it('trims all fields and derives host into a credential', () => {
    const entry = normalizeEntry({
      label: '  GitHub  ',
      username: '  octocat ',
      password: ' pw ',
      url: ' https://github.com/login ',
      notes: ' hi ',
    })
    expect(entry).toEqual({
      label: 'GitHub',
      type: ENTRY_TYPE_CREDENTIAL,
      username: 'octocat',
      password: 'pw',
      url: 'https://github.com/login',
      notes: 'hi',
      totp: undefined,
    })
  })

  it('derives a label from the URL host when none is given (Firefox case)', () => {
    const entry = normalizeEntry({ url: 'https://news.ycombinator.com', password: 'pw' })
    expect(entry?.label).toBe('news.ycombinator.com')
  })

  it('skips rows with no username, password, or totp', () => {
    expect(normalizeEntry({ label: 'Note', notes: 'just a note' })).toBeNull()
    expect(normalizeEntry({ url: 'http://sn' })).toBeNull()
  })

  it('keeps a KEY entry with its value and drops one without', () => {
    const key = normalizeEntry({ type: ENTRY_TYPE_KEY, label: 'Token', value: ' sk_1 ' })
    expect(key).toEqual({ label: 'Token', type: ENTRY_TYPE_KEY, value: 'sk_1', notes: undefined })
    expect(normalizeEntry({ type: ENTRY_TYPE_KEY, label: 'Empty' })).toBeNull()
  })
})

describe('android app-credential URIs (Google Password Manager)', () => {
  it('derives the domain from the reverse-DNS package id', () => {
    expect(extractDomain('android://zQxb6hXv1MJiC1Yyotdhi8HP@com.facebook.katana/')).toBe(
      'facebook.com',
    )
    expect(extractDomain('android://hash@com.spotify.music/')).toBe('spotify.com')
  })

  it('derives domains for real password-manager exports', () => {
    // Signatures use base64url (includes _ and -); the package is after the @.
    expect(extractDomain('android://8XwXgIDMJ7pXw-_a@com.empik.empikapp/')).toBe('empik.com')
    expect(extractDomain('android://YJzPrGM_qk1v@com.binance.dev/')).toBe('binance.com')
    expect(extractDomain('android://certificate@com.disney.disneyplus/')).toBe('disneyplus.com')
  })

  it('gives no domain for a package without a plausible TLD', () => {
    expect(extractDomain('android://hash@localonly/')).toBeUndefined()
  })

  it('gives no domain for platform-hosted apps (github.io is a public suffix)', () => {
    // io.github.<user> reverses to github.io — a code-hosting suffix, not a
    // registrable domain, so it must not become a (wrong) urlDomain.
    expect(extractDomain('android://hash@io.github.someuser/')).toBeUndefined()
  })

  it('never yields a dotless hostname', () => {
    expect(extractDomain('android')).toBeUndefined()
  })
})
