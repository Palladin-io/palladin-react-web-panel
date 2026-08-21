import { createFileRoute } from '@tanstack/react-router'
import { TeamMembersPage } from '../../features/teams'
import { MemberLogsTab } from '../../features/audit'

export const Route = createFileRoute('/_authenticated/settings/team_/$memberId')({
  component: TeamMemberDetailRoute,
})

function TeamMemberDetailRoute() {
  const { memberId } = Route.useParams()
  return (
    <TeamMembersPage
      memberId={memberId}
      renderLogs={(selectedMemberId) => <MemberLogsTab memberId={selectedMemberId} />}
    />
  )
}
