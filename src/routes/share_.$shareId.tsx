import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { EntryShareReceiverPage } from '../features/vaults'

export const Route = createFileRoute('/share_/$shareId')({
  component: RecipientRoute,
})

function RecipientRoute() {
  const { shareId } = Route.useParams()
  const navigate = useNavigate()
  return <EntryShareReceiverPage shareId={shareId} onContinueToAccount={async (target) => {
    await navigate({ to: `/${target}`, search: { redirect: `/share/${shareId}` } })
  }} onSavedToEntry={async ({ vaultId, entryId }) => {
    await navigate({ to: '/vaults/$vaultId/entries/$entryId', params: { vaultId, entryId } })
  }} />
}
