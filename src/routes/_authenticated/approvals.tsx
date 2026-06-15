import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/approvals')({
  beforeLoad: () => {
    throw redirect({ to: '/inbox' })
  },
})
