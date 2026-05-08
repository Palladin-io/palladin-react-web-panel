import { createFileRoute } from '@tanstack/react-router'
import { VaultListPage } from '../../features/vaults'

export const Route = createFileRoute('/_authenticated/vaults')({
  component: VaultListPage,
})
