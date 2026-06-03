import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '../../features/auth'
import { GrantsPage } from '../../features/grants'
import { PERMISSION_GRANT_MANAGE } from '../../shared/lib/permissions'

export const Route = createFileRoute('/_authenticated/vaults_/$vaultId_/grants')({
  beforeLoad: () => {
    const { permissions } = useAuthStore.getState()
    if ((permissions & PERMISSION_GRANT_MANAGE) === 0) {
      throw redirect({ to: '/vaults' })
    }
  },
  component: VaultGrantsRoute,
})

function VaultGrantsRoute() {
  const { vaultId } = Route.useParams()
  return <GrantsPage vaultId={vaultId} />
}
