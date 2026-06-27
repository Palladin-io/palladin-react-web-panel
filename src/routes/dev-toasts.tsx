import { createFileRoute, redirect } from '@tanstack/react-router'
import { ToastsShowcase } from '../features/dev/toasts-showcase'

/**
 * Dev-only toast style playground at top-level `/dev-toasts` — deliberately
 * OUTSIDE `_authenticated` so the unlock guard can't redirect away from it.
 * Toaster + theme live in `Providers` (root), so both work here unguarded.
 *
 * Guarded to DEV builds only: in production the route redirects to `/` so the
 * showcase (which fires every toast variant with `Infinity` duration) is never
 * reachable by end users.
 */
export const Route = createFileRoute('/dev-toasts')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: '/' })
    }
  },
  component: ToastsShowcase,
})
