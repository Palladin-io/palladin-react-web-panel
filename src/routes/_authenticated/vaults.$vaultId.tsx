import { createFileRoute } from '@tanstack/react-router'
import { VaultDetailPage } from '../../features/vaults'

export const Route = createFileRoute('/_authenticated/vaults/$vaultId')({
  component: VaultDetailRoute,
})

function VaultDetailRoute() {
  const { vaultId } = Route.useParams()
  return <VaultDetailPage vaultId={vaultId} />
}
