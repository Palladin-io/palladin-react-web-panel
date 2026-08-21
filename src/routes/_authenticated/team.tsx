import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/team')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/team' })
  },
})
