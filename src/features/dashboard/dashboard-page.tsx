import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ACCOUNT_QUERY_KEY, getAccount } from '../../shared/api/account-api'
import { ErrorState } from '../../shared/components/error-state'
import { Icon } from '../../shared/components/icon'
import { analytics } from '../../shared/lib/analytics'
import { useAgents } from '../agents'
import { useApiKeys } from '../api-keys'
import { usePendingGrants } from '../grants'
import { useWebPush } from '../notifications'
import { useVaults } from '../vaults'
import { DashboardStatsRow } from './components/dashboard-stats-row'
import { OnboardingChecklist } from './components/onboarding-checklist'
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
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="min-h-full px-4 py-4 text-[var(--cv-t1)]">
      <header className="mb-4">
        <h1 className="text-xl font-bold text-[var(--cv-t1)]">
          {firstName
            ? t('dashboard.greeting', { name: firstName })
            : t('dashboard.greetingGeneric')}
        </h1>
        <p className="text-xs text-[var(--cv-t3)]">{today}</p>
      </header>

      <DashboardStatsRow
        vaults={vaultCount}
        entries={entryCount}
        agents={activeAgents.length}
        pending={pendingGrantCount}
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
        <>
          <SectionHeader title={t('dashboard.pendingApprovals')} />
          <div className="mb-4">
            <UnknownAgentCard agent={pendingAgents[0]} />
          </div>
          <SectionHeader title={t('dashboard.recentActivity')} />
          <RecentActivityEmpty />
        </>
      ) : (
        <>
          <SectionHeader
            title={t('dashboard.pendingApprovals')}
            action={
              <Link
                to="/approvals"
                className="text-xs font-medium text-[var(--cv-primary)] hover:underline"
              >
                {t('dashboard.viewAll')}
              </Link>
            }
          />
          <div className="mb-4">
            <RecentActivityEmpty />
          </div>
        </>
      )}
    </div>
  )
}

function SectionHeader({
  title,
  action,
}: {
  title: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="text-sm font-semibold text-[var(--cv-t1)]">{title}</span>
      {action}
    </div>
  )
}

function RecentActivityEmpty() {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl bg-[var(--cv-card-bg)] px-4 py-8 text-center shadow-sm">
      <Icon
        name="history"
        size={32}
        color="var(--cv-t3)"
        className="mb-2 block"
      />
      <span className="text-xs text-[var(--cv-t3)]">
        {t('dashboard.noActivity')}
      </span>
    </div>
  )
}
