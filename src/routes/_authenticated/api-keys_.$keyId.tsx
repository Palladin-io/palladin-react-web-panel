import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/api-keys_/$keyId')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/settings/api-keys/$keyId', params: { keyId: params.keyId } })
  },
})
