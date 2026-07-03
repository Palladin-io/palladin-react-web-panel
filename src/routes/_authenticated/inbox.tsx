import { createFileRoute } from '@tanstack/react-router'
import { NotificationCenterPage } from '../../features/notifications'

type InboxTab = 'all' | 'todo' | 'history' | 'grants'
const INBOX_TABS: InboxTab[] = ['all', 'todo', 'history', 'grants']

export const Route = createFileRoute('/_authenticated/inbox')({
  validateSearch: (search: Record<string, unknown>): { tab?: InboxTab } => {
    const tab = search.tab
    return typeof tab === 'string' && (INBOX_TABS as string[]).includes(tab)
      ? { tab: tab as InboxTab }
      : {}
  },
  component: InboxRoute,
})

function InboxRoute() {
  const { tab } = Route.useSearch()
  return <NotificationCenterPage initialSegment={tab} />
}
