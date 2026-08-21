import { createFileRoute } from '@tanstack/react-router'
import { SecurityPage } from '../../features/auth'

export const Route = createFileRoute('/_authenticated/settings/security')({
  component: SecurityPage,
})
