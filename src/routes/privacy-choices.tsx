import { createFileRoute, redirect } from '@tanstack/react-router'
import { parseAuthRedirect } from '../shared/lib/auth-redirect'

/** Old links resume the normal verification/setup/unlock guards. */
export const Route = createFileRoute('/privacy-choices')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({ redirect: parseAuthRedirect(search.redirect) }),
  beforeLoad: ({ search }) => {
    const target = search.redirect ?? '/'
    throw redirect({ href: new URL(target, 'https://palladin.invalid').pathname === '/privacy-choices' ? '/' : target })
  },
})
