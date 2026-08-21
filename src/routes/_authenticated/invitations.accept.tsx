import { createFileRoute } from '@tanstack/react-router'
import { AcceptOrganizationInvitationPage } from '../../features/teams'

interface InvitationAcceptSearch {
  token?: string
}

export const Route = createFileRoute('/_authenticated/invitations/accept')({
  validateSearch: (search: Record<string, unknown>): InvitationAcceptSearch => ({
    token:
      typeof search.token === 'string' && search.token.trim().length > 0
        ? search.token.trim()
        : undefined,
  }),
  component: InvitationAcceptRoute,
})

function InvitationAcceptRoute() {
  const { token } = Route.useSearch()
  return <AcceptOrganizationInvitationPage token={token} />
}
