import { createFileRoute } from '@tanstack/react-router'
import { VaultListPage } from '../../features/vaults'

interface VaultListSearch {
  intent?: 'import'
}

export const Route = createFileRoute('/_authenticated/vaults')({
  validateSearch: (search: Record<string, unknown>): VaultListSearch => (
    search.intent === 'import' ? { intent: 'import' } : {}
  ),
  component: VaultListRoute,
})

function VaultListRoute() {
  const { intent } = Route.useSearch()
  return <VaultListPage initialIntent={intent} />
}
