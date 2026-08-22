import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
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
import { useAuthenticatedQueryKey, useAuthStore } from '../auth'
import {
  PendingGrantsPanel,
  useGrantSummary,
  usePendingGrants,
} from '../grants'
import { useVaults } from '../vaults'
import { DashboardHeader } from './components/dashboard-header'
import { DashboardStatsRow } from './components/dashboard-stats-row'
import { OnboardingChecklist } from './components/onboarding-checklist'
import { RecentActivitySection } from './components/recent-activity-section'
import { RecentEntriesSection } from './components/recent-entries-section'
import { UnknownAgentCard } from './components/unknown-agent-card'

const ONBOARDING_SKIPPED_KEY = 'onboarding_skipped'
const MOBILE_SKIPPED_KEY = 'mobile_onboarding_skipped'

// Dismissal flags are scoped per user so one account's "skip" never hides
// onboarding for a different account (or a fresh signup) on the same browser.
const skipKey = (base: string, userId: string) => `${base}:${userId}`

function readFlag(key: string): boolean {
  return localStorage.getItem(key) === 'true'
}

export function DashboardPage() {
  const { t } = useTranslation()

  const accountQueryKey = useAuthenticatedQueryKey(ACCOUNT_QUERY_KEY)
  const account = useQuery({ queryKey: accountQueryKey, queryFn: getAccount })
  const vaults = useVaults()
  const apiKeys = useApiKeys()
  const agents = useAgents()
  const pendingGrants = usePendingGrants()

  const permissions = useAuthStore((s) => s.permissions)
  const canViewAudit = (permissions & PERMISSION_AUDIT_VIEW) !== 0
  const canManageGrants = (permissions & PERMISSION_GRANT_MANAGE) !== 0
  const auditLogs = useOrgAuditLogs({}, canViewAudit)
  const grantSummary = useGrantSummary(canManageGrants)

  // userId (from the account query) scopes the localStorage dismissal flags.
  // Until it resolves we treat nothing as skipped, so onboarding is never
  // hidden without a matching user-scoped flag.
  const userId = account.data?.userId ?? null

  const [dismissed, setDismissed] = useState(false)
  const [mobileSkipped, setMobileSkipped] = useState(false)

  useEffect(() => {
    // These flags intentionally resynchronize when the authenticated user changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(userId ? readFlag(skipKey(ONBOARDING_SKIPPED_KEY, userId)) : false)
    setMobileSkipped(
      userId ? readFlag(skipKey(MOBILE_SKIPPED_KEY, userId)) : false,
    )
  }, [userId])

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

  // The default vault is auto-created on account setup, so "entry done"
  // (≥1 entry across all vaults) is the meaningful first step for the user.
  const entryDone = entryCount > 0
  const apiKeyDone = (apiKeys.data?.length ?? 0) > 0
  const agentDone = activeAgents.length > 0
  // `mobileRegistered` is the one step the client can't derive locally — it
  // comes from the server (the user's push devices). Absent on older backends.
  const mobileRegistered =
    account.data?.onboardingSteps?.mobileRegistered ?? false

  // The checklist tracks the setup steps (entry, API key, agent, mobile) — NOT
  // `account.isOnboarded`, which means account *key* setup (a routing flag,
  // already true for anyone viewing the dashboard). The mobile step is
  // skippable. Wait for the queries to resolve so an onboarded user never
  // flashes the checklist.
  const setupComplete =
    entryDone && apiKeyDone && agentDone && (mobileRegistered || mobileSkipped)
  const onboardingDataReady =
    account.data != null &&
    vaults.data != null &&
    apiKeys.data != null &&
    agents.data != null
  const showOnboarding = onboardingDataReady && !setupComplete && !dismissed

  const wasActiveRef = useRef(false)
  useEffect(() => {
    if (showOnboarding) wasActiveRef.current = true
  }, [showOnboarding])

  const completedFiredRef = useRef(false)
  useEffect(() => {
    if (setupComplete && wasActiveRef.current && !completedFiredRef.current) {
      completedFiredRef.current = true
      analytics.capture('dashboard', 'onboarding-completed')
      if (userId) {
        localStorage.setItem(skipKey(ONBOARDING_SKIPPED_KEY, userId), 'true')
      }
    }
  }, [setupComplete, userId])

  if (account.isError) {
    return (
      <div className="px-4 py-4">
        <ErrorState message={t('common.couldNotLoadAccount')} onRetry={account.refetch} />
      </div>
    )
  }

  function handleGetApp() {
    // The mobile app isn't published yet — keep the step visible but give the
    // user feedback instead of a dead button. Swap for a store link on launch.
    toast.info(t('dashboard.onboarding.getAppComingSoon'))
  }

  function handleSkipMobile() {
    if (userId) localStorage.setItem(skipKey(MOBILE_SKIPPED_KEY, userId), 'true')
    setMobileSkipped(true)
  }

  function handleDismissOnboarding() {
    if (userId) localStorage.setItem(skipKey(ONBOARDING_SKIPPED_KEY, userId), 'true')
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
          entryDone={entryDone}
          apiKeyDone={apiKeyDone}
          agentDone={agentDone}
          mobileRegistered={mobileRegistered}
          mobileSkipped={mobileSkipped}
          onGetApp={handleGetApp}
          onSkipMobile={handleSkipMobile}
          onDismiss={handleDismissOnboarding}
        />
      ) : pendingAgents.length > 0 ? (
        <div className="flex flex-col gap-6">
          <section>
            <div className="mb-2">
              <span className="text-ui font-semibold text-[var(--cv-t1)]">
                {t('dashboard.pendingApprovals')}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {pendingAgents.map((agent) => (
                <UnknownAgentCard key={agent.agentId} agent={agent} />
              ))}
            </div>
          </section>
          <RecentEntriesSection />
          <RecentActivitySection />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <section>
            <PendingGrantsPanel variant="carousel" viewAllTo="/inbox" />
          </section>
          <RecentEntriesSection />
          <RecentActivitySection />
        </div>
      )}
    </div>
  )
}
