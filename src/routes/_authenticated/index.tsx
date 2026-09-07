import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '../../features/dashboard'
import { useState } from 'react'
import { AddAgentDialog } from '../../features/agents'
import { useAuthStore } from '../../features/auth'
import { canPairAgent, PERMISSION_WRITE_API_KEY } from '../../shared/lib/permissions'

export const Route = createFileRoute('/_authenticated/')({
  component: DashboardRoute,
})

function DashboardRoute() {
  const [showAddAgent, setShowAddAgent] = useState(false)
  const permissions = useAuthStore((state) => state.permissions)
  const canPair = canPairAgent(permissions)
  return (
    <>
      <DashboardPage onRegisterAgent={canPair ? () => setShowAddAgent(true) : undefined} />
      <AddAgentDialog
        open={showAddAgent && canPair}
        onClose={() => setShowAddAgent(false)}
        canCreateApiKey={(permissions & PERMISSION_WRITE_API_KEY) !== 0}
      />
    </>
  )
}
