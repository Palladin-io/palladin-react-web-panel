import { createFileRoute } from '@tanstack/react-router'
import { TeamMembersPage } from '../../features/teams'

export const Route = createFileRoute('/_authenticated/team')({
  component: TeamMembersPage,
})
