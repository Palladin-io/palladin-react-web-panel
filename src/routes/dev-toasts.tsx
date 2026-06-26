import { createFileRoute } from '@tanstack/react-router'
import { ToastsShowcase } from '../features/dev/toasts-showcase'

/**
 * Dev-only toast style playground at top-level `/dev-toasts` — deliberately
 * OUTSIDE `_authenticated` so the unlock guard can't redirect away from it.
 * Toaster + theme live in `Providers` (root), so both work here unguarded.
 */
export const Route = createFileRoute('/dev-toasts')({
  component: ToastsShowcase,
})
