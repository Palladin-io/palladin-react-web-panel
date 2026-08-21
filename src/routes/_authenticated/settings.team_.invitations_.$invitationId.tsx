import { createFileRoute } from '@tanstack/react-router'
import { TeamMembersPage } from '../../features/teams'
import { MemberLogsTab } from '../../features/audit'

export const Route = createFileRoute('/_authenticated/settings/team_/invitations_/$invitationId')({
  component: TeamInvitationDetailRoute,
})

function TeamInvitationDetailRoute() {
  const { invitationId } = Route.useParams()
  return (
    <TeamMembersPage
      invitationId={invitationId}
      renderLogs={(memberId) => <MemberLogsTab memberId={memberId} />}
    />
  )
}
