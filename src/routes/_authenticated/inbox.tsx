import { createFileRoute } from '@tanstack/react-router'
import { NotificationCenterPage } from '../../features/notifications'

export const Route = createFileRoute('/_authenticated/inbox')({
  component: InboxRoute,
})

function InboxRoute() {
  return <NotificationCenterPage />
}
