import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '../../features/auth'
import { PendingGrantsPage } from '../../features/grants'
import { PERMISSION_GRANT_MANAGE } from '../../shared/lib/permissions'

export const Route = createFileRoute('/_authenticated/approvals')({
  beforeLoad: () => {
    const { permissions } = useAuthStore.getState()
    if ((permissions & PERMISSION_GRANT_MANAGE) === 0) {
      throw redirect({ to: '/vaults' })
    }
  },
  component: ApprovalsRoute,
})

function ApprovalsRoute() {
  return <PendingGrantsPage />
}
