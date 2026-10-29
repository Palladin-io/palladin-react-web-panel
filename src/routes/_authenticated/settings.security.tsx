import { createFileRoute } from '@tanstack/react-router'
import { SecurityPage } from '../../features/auth'
import { ApproverKeySection } from '../../features/submissions'

export const Route = createFileRoute('/_authenticated/settings/security')({
  component: SecuritySettingsRoute,
})

function SecuritySettingsRoute() {
  return <SecurityPage><ApproverKeySection /></SecurityPage>
}
