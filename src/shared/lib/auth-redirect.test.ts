import { describe, expect, it } from 'vitest'
import {
  buildLoginRedirectHref,
  getAuthRedirectFromHref,
  parseAuthRedirect,
} from './auth-redirect'

describe('parseAuthRedirect', () => {
  it('preserves an internal deep link including search and hash', () => {
    expect(
      parseAuthRedirect('/vaults/vault-1/entries/entry-1?tab=logs#history'),
    ).toBe('/vaults/vault-1/entries/entry-1?tab=logs#history')
  })

  it.each([
    'https://attacker.example/steal',
    '//attacker.example/steal',
    '/\\attacker.example/steal',
    'javascript:alert(1)',
    '/login',
    '/unlock?redirect=/vaults',
    '',
    undefined,
  ])('rejects unsafe or looping target %s', (target) => {
    expect(parseAuthRedirect(target)).toBeUndefined()
  })
})

describe('getAuthRedirectFromHref', () => {
  it('extracts the original target from an auth gate URL', () => {
    expect(
      getAuthRedirectFromHref(
        'https://app.palladin.io/unlock?redirect=%2Fvaults%2Fvault-1%2Fentries%2Fentry-1%3Ftab%3Dlogs%23history',
      ),
    ).toBe('/vaults/vault-1/entries/entry-1?tab=logs#history')
  })

  it('builds a login URL without nesting the unlock gate', () => {
    expect(
      buildLoginRedirectHref(
        'https://app.palladin.io/unlock?redirect=%2Fvaults%2Fvault-1%2Fentries%2Fentry-1',
      ),
    ).toBe(
      '/login?redirect=%2Fvaults%2Fvault-1%2Fentries%2Fentry-1',
    )
  })
})
