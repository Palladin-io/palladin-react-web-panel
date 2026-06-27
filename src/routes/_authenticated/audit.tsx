import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuditLogPage } from '../../features/audit'
import { useAuthStore } from '../../features/auth'
import { PERMISSION_AUDIT_VIEW } from '../../shared/lib/permissions'

export const Route = createFileRoute('/_authenticated/audit')({
  beforeLoad: () => {
    const { permissions } = useAuthStore.getState()
    if ((permissions & PERMISSION_AUDIT_VIEW) === 0) {
      throw redirect({ to: '/vaults' })
    }
  },
  component: AuditRoute,
})

function AuditRoute() {
  return <AuditLogPage />
}
