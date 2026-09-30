import { createFileRoute } from '@tanstack/react-router'
import { EntryShareReceiverPage } from '../features/vaults'

export const Route = createFileRoute('/share')({
  component: () => <EntryShareReceiverPage shareId="" />,
})
