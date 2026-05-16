import { createFileRoute } from '@tanstack/react-router'
import { EntryDetailPage } from '../../features/vaults'

export const Route = createFileRoute(
  '/_authenticated/vaults_/$vaultId_/entries_/$entryId',
)({
  component: EntryDetailRoute,
})

function EntryDetailRoute() {
  const { vaultId, entryId } = Route.useParams()
  return <EntryDetailPage vaultId={vaultId} entryId={entryId} />
}
