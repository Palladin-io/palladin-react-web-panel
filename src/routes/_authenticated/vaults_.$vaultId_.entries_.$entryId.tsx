import { createFileRoute } from '@tanstack/react-router'
import { EntryDetailPage } from '../../features/vaults'

export const Route = createFileRoute(
  '/_authenticated/vaults_/$vaultId_/entries_/$entryId',
)({
  validateSearch: (search: Record<string, unknown>): { tab?: 'sharing' } =>
    search.tab === 'sharing' ? { tab: 'sharing' } : {},
  component: EntryDetailRoute,
})

function EntryDetailRoute() {
  const { vaultId, entryId } = Route.useParams()
  const { tab } = Route.useSearch()
  return <EntryDetailPage key={`${vaultId}:${entryId}:${tab ?? 'details'}`} vaultId={vaultId} entryId={entryId} initialTab={tab} />
}
