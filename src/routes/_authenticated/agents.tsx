import { createFileRoute, redirect } from '@tanstack/react-router'
import { AgentsPage } from '../../features/agents'
import { useAuthStore } from '../../features/auth'
import {
  PERMISSION_AGENT_MANAGE,
  canPairAgent,
  PERMISSION_WRITE_API_KEY,
} from '../../shared/lib/permissions'

export const Route = createFileRoute('/_authenticated/agents')({
  beforeLoad: () => {
    const { permissions } = useAuthStore.getState()
    if ((permissions & PERMISSION_AGENT_MANAGE) === 0) {
      throw redirect({ to: '/vaults' })
    }
  },
  component: AgentsRoute,
})

function AgentsRoute() {
  const permissions = useAuthStore((state) => state.permissions)
  return (
    <AgentsPage
      canStartPairing={canPairAgent(permissions)}
      canCreateApiKey={(permissions & PERMISSION_WRITE_API_KEY) !== 0}
    />
  )
}
