import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '../../features/auth'
import { PermissionsPage } from '../../features/permissions'
import { PERMISSION_ORGANIZATION_MANAGEMENT } from '../../shared/lib/permissions'

export const Route = createFileRoute('/_authenticated/settings/permissions')({
  beforeLoad: requireOrganizationManagement,
  component: PermissionsPage,
})

function requireOrganizationManagement() {
  if ((useAuthStore.getState().permissions & PERMISSION_ORGANIZATION_MANAGEMENT) === 0) {
    throw redirect({ to: '/settings/general' })
  }
}
