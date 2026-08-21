import { createFileRoute, redirect } from '@tanstack/react-router'
import { TeamMembersPage } from '../../features/teams'
import { MemberLogsTab } from '../../features/audit'
import { useAuthStore } from '../../features/auth'
import { PERMISSION_ADD_USER } from '../../shared/lib/permissions'

export const Route = createFileRoute('/_authenticated/settings/team_/invitations_/$invitationId')({
  beforeLoad: requireAddUser,
  component: TeamInvitationDetailRoute,
})

function requireAddUser() {
  if ((useAuthStore.getState().permissions & PERMISSION_ADD_USER) === 0) {
    throw redirect({ to: '/settings/team' })
  }
}

function TeamInvitationDetailRoute() {
  const { invitationId } = Route.useParams()
  return (
    <TeamMembersPage
      invitationId={invitationId}
      renderLogs={(memberId) => <MemberLogsTab memberId={memberId} />}
    />
  )
}
