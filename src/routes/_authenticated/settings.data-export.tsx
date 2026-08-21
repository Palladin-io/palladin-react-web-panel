import { createFileRoute } from '@tanstack/react-router'
import { DataExportPage } from '../../features/settings'

export const Route = createFileRoute('/_authenticated/settings/data-export')({
  component: DataExportPage,
})
