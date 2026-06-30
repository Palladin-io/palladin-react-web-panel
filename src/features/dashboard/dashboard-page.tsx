import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ACCOUNT_QUERY_KEY, getAccount } from '../../shared/api/account-api'
import { ErrorState } from '../../shared/components/error-state'
import { analytics } from '../../shared/lib/analytics'
import {
  PERMISSION_AUDIT_VIEW,
  PERMISSION_GRANT_MANAGE,
} from '../../shared/lib/permissions'
import { useAgents } from '../agents'
import { useApiKeys } from '../api-keys'
import { useOrgAuditLogs } from '../audit'
import { useAuthStore } from '../auth'
import {
  PendingGrantsPanel,
  useGrantSummary,
  usePendingGrants,
} from '../grants'
import { useWebPush } from '../notifications'
import { useVaults } from '../vaults'
import { DashboardHeader } from './components/dashboard-header'
import { DashboardStatsRow } from './components/dashboard-stats-row'
import { OnboardingChecklist } from './components/onboarding-checklist'
import { RecentActivitySection } from './components/recent-activity-section'
import { UnknownAgentCard } from './components/unknown-agent-card'

const ONBOARDING_SKIPPED_KEY = 'onboarding_skipped'
const NOTIFICATIONS_SKIPPED_KEY = 'notifications_onboarding_skipped'

function readFlag(key: string): boolean {
  return localStorage.getItem(key) === 'true'
}

export function DashboardPage() {
  const { t } = useTranslation()

  const account = useQuery({ queryKey: ACCOUNT_QUERY_KEY, queryFn: getAccount })
  const vaults = useVaults()
  const apiKeys = useApiKeys()
  const agents = useAgents()
  const pendingGrants = usePendingGrants()
  const webPush = useWebPush()

  const permissions = useAuthStore((s) => s.permissions)
  const canViewAudit = (permissions & PERMISSION_AUDIT_VIEW) !== 0
  const canManageGrants = (permissions & PERMISSION_GRANT_MANAGE) !== 0
  const auditLogs = useOrgAuditLogs({}, canViewAudit)
  const grantSummary = useGrantSummary(canManageGrants)

  const [dismissed, setDismissed] = useState(() => readFlag(ONBOARDING_SKIPPED_KEY))
  const [notifSkipped, setNotifSkipped] = useState(() =>
    readFlag(NOTIFICATIONS_SKIPPED_KEY),
  )

  const isOnboarded = account.data?.isOnboarded === true
  const showOnboarding = account.data != null && !isOnboarded && !dismissed

  // Track whether the checklist was ever active so we only fire the
  // "completed" event when onboarding finishes mid-session — never when the
  // user was already onboarded on first render. `isOnboarded` turning true
  // already hides the checklist (it gates `showOnboarding`), so the effect
  // only persists the skip + fires analytics once; no state flip needed.
  const wasActiveRef = useRef(false)
  useEffect(() => {
    if (showOnboarding) wasActiveRef.current = true
  }, [showOnboarding])

  const completedFiredRef = useRef(false)
  useEffect(() => {
    if (isOnboarded && wasActiveRef.current && !completedFiredRef.current) {
      completedFiredRef.current = true
      analytics.capture('identity', 'onboarding-completed')
      localStorage.setItem(ONBOARDING_SKIPPED_KEY, 'true')
    }
  }, [isOnboarded])

  if (account.isError) {
    return (
      <div className="px-4 py-4">
        <ErrorState message={t('common.couldNotLoadAccount')} onRetry={account.refetch} />
      </div>
    )
  }

  const vaultList = vaults.data?.vaults ?? []
  const vaultCount = vaultList.length
  const entryCount = vaultList.reduce((sum, v) => sum + v.entryCount, 0)
  const activeAgents = agents.data?.filter((a) => a.status !== 'pending') ?? []
  const pendingAgents = agents.data?.filter((a) => a.status === 'pending') ?? []
  const pendingGrantCount = pendingGrants.data?.length ?? 0
  // No total-count endpoint exists for audit logs (cursor-paginated), so the
  // Logs metric reflects how many rows are loaded and marks "+" when more remain.
  const loadedLogCount = (auditLogs.data?.pages ?? []).reduce(
    (sum, page) => sum + page.items.length,
    0,
  )

  const notificationsDone = webPush.status === 'registered' || notifSkipped
  const vaultDone = vaultCount > 0
  const apiKeyDone = (apiKeys.data?.length ?? 0) > 0
  const agentDone = activeAgents.length > 0

  function handleEnableNotifications() {
    void webPush.requestPermissionAndRegister()
  }

  function handleSkipNotifications() {
    localStorage.setItem(NOTIFICATIONS_SKIPPED_KEY, 'true')
    setNotifSkipped(true)
  }

  function handleDismissOnboarding() {
    localStorage.setItem(ONBOARDING_SKIPPED_KEY, 'true')
    setDismissed(true)
  }

  const firstName = account.data?.displayName?.split(' ')[0]

  return (
    <div className="min-h-full px-4 py-4 text-[var(--cv-t1)]">
      <DashboardHeader firstName={firstName} />

      <DashboardStatsRow
        vaults={vaultCount}
        entries={entryCount}
        agents={activeAgents.length}
        pending={pendingGrantCount}
        active={grantSummary.data?.active}
        expired={grantSummary.data?.expired}
        logs={canViewAudit ? loadedLogCount : undefined}
        logsApprox={auditLogs.hasNextPage ?? false}
      />

      {showOnboarding ? (
        <OnboardingChecklist
          notificationsDone={notificationsDone}
          vaultDone={vaultDone}
          apiKeyDone={apiKeyDone}
          agentDone={agentDone}
          onEnableNotifications={handleEnableNotifications}
          onSkipNotifications={handleSkipNotifications}
          onDismiss={handleDismissOnboarding}
        />
      ) : pendingAgents.length > 0 ? (
        <div className="flex flex-col gap-6">
          <section>
            <div className="mb-2">
              <span className="text-sm font-semibold text-[var(--cv-t1)]">
                {t('dashboard.pendingApprovals')}
              </span>
            </div>
            <UnknownAgentCard agent={pendingAgents[0]} />
          </section>
          <RecentActivitySection />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <section>
            <PendingGrantsPanel variant="carousel" viewAllTo="/inbox" />
          </section>
          <RecentActivitySection />
        </div>
      )}
    </div>
  )
}
