import { createFileRoute } from '@tanstack/react-router'
import { VaultSettingsPage } from '../../features/vaults'

export const Route = createFileRoute('/_authenticated/vaults_/$vaultId_/settings')({
  component: VaultSettingsRoute,
})

function VaultSettingsRoute() {
  const { vaultId } = Route.useParams()
  return <VaultSettingsPage vaultId={vaultId} />
}
