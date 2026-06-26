import { createFileRoute } from '@tanstack/react-router'
import { ToastsShowcase } from '../../features/dev/toasts-showcase'

/** Dev-only toast style playground. Not linked in the nav — go to `/dev-toasts`. */
export const Route = createFileRoute('/_authenticated/dev-toasts')({
  component: ToastsShowcase,
})
