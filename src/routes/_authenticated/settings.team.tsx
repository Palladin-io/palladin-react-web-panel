import { createFileRoute } from '@tanstack/react-router'
import { TeamMembersPage } from '../../features/teams'
import { MemberLogsTab } from '../../features/audit'

export const Route = createFileRoute('/_authenticated/settings/team')({
  component: TeamRoute,
})

function TeamRoute() {
  return <TeamMembersPage renderLogs={(memberId) => <MemberLogsTab memberId={memberId} />} />
}
