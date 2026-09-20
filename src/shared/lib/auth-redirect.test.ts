import { describe, expect, it } from 'vitest'
import {
  buildLoginRedirectHref,
  getAuthRedirectFromHref,
  parseAuthRedirect,
} from './auth-redirect'

describe('parseAuthRedirect', () => {
  const sharePath = '/share/00112233-4455-4677-8899-aabbccddeeff'

  it('retains only the canonical sharing route, never its fragment or query', () => {
    expect(parseAuthRedirect(`${sharePath}?key=synthetic#v=1&key=synthetic&access=synthetic`)).toBe(sharePath)
    expect(buildLoginRedirectHref(`https://app.palladin.io${sharePath}#key=synthetic`))
      .toBe(`/login?redirect=${encodeURIComponent(sharePath)}`)
  })

  it.each(['/share/not-a-share-id', '/share/secret/extra', '/sh%61re/secret', '/share'])(
    'scrubs invalid secret-bearing sharing route %s', (path) => {
    expect(parseAuthRedirect(`${path}?access=synthetic#key=synthetic`)).toBe('/share')
    },
  )

  it('unwraps a registration return without copying the link secrets', () => {
    expect(getAuthRedirectFromHref(`/register?redirect=${encodeURIComponent(`${sharePath}#key=synthetic`)}`)).toBe(sharePath)
    expect(parseAuthRedirect('/register?redirect=/vaults')).toBeUndefined()
  })

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
