import { createFileRoute } from '@tanstack/react-router'
import { EntryShareReceiverPage } from '../features/vaults'

export const Route = createFileRoute('/share_/$shareId')({
  component: RecipientRoute,
})

function RecipientRoute() {
  const { shareId } = Route.useParams()
  return <EntryShareReceiverPage shareId={shareId} />
}
