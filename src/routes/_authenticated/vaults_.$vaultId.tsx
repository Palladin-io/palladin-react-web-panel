import { createFileRoute } from '@tanstack/react-router'
import { VaultDetailPage, type VaultDetailTab } from '../../features/vaults'

const VAULT_TABS: VaultDetailTab[] = ['entries', 'agents', 'audit-log', 'members', 'settings']

export const Route = createFileRoute('/_authenticated/vaults_/$vaultId')({
  validateSearch: (search: Record<string, unknown>): { tab?: VaultDetailTab } => {
    const tab = search.tab
    return typeof tab === 'string' && VAULT_TABS.includes(tab as VaultDetailTab)
      ? { tab: tab as VaultDetailTab }
      : {}
  },
  component: VaultDetailRoute,
})

function VaultDetailRoute() {
  const { vaultId } = Route.useParams()
  const { tab } = Route.useSearch()
  return <VaultDetailPage vaultId={vaultId} initialTab={tab} />
}
