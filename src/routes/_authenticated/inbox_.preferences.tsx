import { createFileRoute } from '@tanstack/react-router'
import { NotificationPreferencesPage } from '../../features/notifications'

export const Route = createFileRoute('/_authenticated/inbox_/preferences')({
  component: InboxPreferencesRoute,
})

function InboxPreferencesRoute() {
  return <NotificationPreferencesPage />
}
