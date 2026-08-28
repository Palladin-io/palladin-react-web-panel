import { createFileRoute } from '@tanstack/react-router'
import { VaultDetailPage, type VaultDetailTab } from '../../features/vaults'

const VAULT_TABS: VaultDetailTab[] = ['entries', 'agents', 'audit-log', 'members', 'settings']

interface VaultDetailSearch {
  tab?: VaultDetailTab
  import?: boolean
}

export const Route = createFileRoute('/_authenticated/vaults_/$vaultId')({
  validateSearch: (search: Record<string, unknown>): VaultDetailSearch => {
    const tab = search.tab
    const validated: VaultDetailSearch = {}
    if (typeof tab === 'string' && VAULT_TABS.includes(tab as VaultDetailTab)) {
      validated.tab = tab as VaultDetailTab
    }
    if (search.import === true || search.import === 'true') {
      validated.import = true
    }
    return validated
  },
  component: VaultDetailRoute,
})

function VaultDetailRoute() {
  const { vaultId } = Route.useParams()
  const { tab, import: openImport } = Route.useSearch()
  return <VaultDetailPage vaultId={vaultId} initialTab={tab} initialImport={openImport} />
}
