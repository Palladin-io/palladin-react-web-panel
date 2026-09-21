import { createFileRoute } from '@tanstack/react-router'
import { EntryDetailPage } from '../../features/vaults'

export const Route = createFileRoute(
  '/_authenticated/vaults_/$vaultId_/entries_/$entryId',
)({
  validateSearch: (search: Record<string, unknown>): { from?: 'entries' } => search.from === 'entries' ? { from: 'entries' } : {},
  component: EntryDetailRoute,
})

function EntryDetailRoute() {
  const { vaultId, entryId } = Route.useParams()
  const { from } = Route.useSearch()
  return <EntryDetailPage vaultId={vaultId} entryId={entryId} fromEntries={from === 'entries'} />
}
