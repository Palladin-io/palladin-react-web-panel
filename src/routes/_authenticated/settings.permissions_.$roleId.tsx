import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '../../features/auth'
import { PermissionsPage } from '../../features/permissions'
import { PERMISSION_ORGANIZATION_MANAGEMENT } from '../../shared/lib/permissions'

export const Route = createFileRoute('/_authenticated/settings/permissions_/$roleId')({
  beforeLoad: () => {
    if ((useAuthStore.getState().permissions & PERMISSION_ORGANIZATION_MANAGEMENT) === 0) {
      throw redirect({ to: '/settings/general' })
    }
  },
  component: PermissionDetailRoute,
})

function PermissionDetailRoute() {
  const { roleId } = Route.useParams()
  return <PermissionsPage roleId={roleId} />
}
