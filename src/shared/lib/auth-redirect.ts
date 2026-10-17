import { entrySharePath } from '../crypto/entry-share-link'

const INTERNAL_URL_BASE = 'https://palladin.invalid'
const AUTH_GATE_PATHS = new Set(['/login', '/unlock', '/register', '/verify-email'])

export function parseAuthRedirect(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return undefined
  }

  try {
    const target = new URL(value, INTERNAL_URL_BASE)

    if (
      target.origin !== INTERNAL_URL_BASE ||
      AUTH_GATE_PATHS.has(target.pathname)
    ) {
      return undefined
    }

    const decodedPath = decodeURIComponent(target.pathname)
    if (decodedPath === '/share' || decodedPath.startsWith('/share/')) {
      try {
        const path = entrySharePath(target.pathname.slice('/share/'.length))
        return path === target.pathname ? path : '/share'
      } catch { return '/share' }
    }

    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return undefined
  }
}

export function getAuthRedirectFromHref(href: string): string | undefined {
  try {
    const location = new URL(href, INTERNAL_URL_BASE)
    const gateRedirect = AUTH_GATE_PATHS.has(location.pathname)
      ? parseAuthRedirect(location.searchParams.get('redirect'))
      : undefined

    return (
      gateRedirect ??
      parseAuthRedirect(
        `${location.pathname}${location.search}${location.hash}`,
      )
    )
  } catch {
    return undefined
  }
}

export function buildLoginRedirectHref(currentHref: string): string {
  const redirect = getAuthRedirectFromHref(currentHref)
  return redirect && redirect !== '/'
    ? `/login?redirect=${encodeURIComponent(redirect)}`
    : '/login'
}
