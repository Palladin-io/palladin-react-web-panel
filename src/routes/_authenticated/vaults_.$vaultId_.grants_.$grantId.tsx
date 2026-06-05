import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '../../features/auth'
import { GrantsPage } from '../../features/grants'
import { PERMISSION_GRANT_MANAGE } from '../../shared/lib/permissions'

export const Route = createFileRoute(
  '/_authenticated/vaults_/$vaultId_/grants_/$grantId',
)({
  beforeLoad: () => {
    const { permissions } = useAuthStore.getState()
    if ((permissions & PERMISSION_GRANT_MANAGE) === 0) {
      throw redirect({ to: '/vaults' })
    }
  },
  component: VaultGrantDetailRoute,
})

function VaultGrantDetailRoute() {
  const { vaultId, grantId } = Route.useParams()
  return <GrantsPage vaultId={vaultId} grantId={grantId} />
}
