import { createFileRoute } from '@tanstack/react-router'
import { GlobalEntriesPage } from '../../features/vaults'

export const Route = createFileRoute('/_authenticated/entries')({ component: GlobalEntriesPage })
