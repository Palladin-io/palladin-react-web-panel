import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { Icon } from '../../../shared/components/icon'
import { analytics } from '../../../shared/lib/analytics'

export interface OnboardingChecklistProps {
  notificationsDone: boolean
  vaultDone: boolean
  apiKeyDone: boolean
  agentDone: boolean
  /** Request Web Push permission — the page owns the actual FCM registration. */
  onEnableNotifications: () => void
  /** Skip the notifications step — the page persists the skip flag + re-renders. */
  onSkipNotifications: () => void
  /** Dismiss the whole checklist — the page persists `onboarding_skipped`. */
  onDismiss: () => void
}

type StepKey = 'notifications' | 'vault' | 'apiKey' | 'agent'

/**
 * Per-step icon glyph + accent. These accents mirror the Astro onboarding
 * design (DashboardNewUserMain) one-to-one; there are no `--cv-*` tokens for
 * them, so they live here as the single source of truth for this surface.
 */
const STEP_VISUALS: Record<StepKey, { icon: string; color: string }> = {
  notifications: { icon: 'notifications_active', color: '#F59E0B' },
  vault: { icon: 'shield', color: '#60A5FA' },
  apiKey: { icon: 'key', color: '#8B5CF6' },
  agent: { icon: 'smart_toy', color: '#2EC4B6' },
}

/** Opacity for a future, not-yet-active step, by distance from the active one. */
function futureOpacity(distance: number): number {
  if (distance === 1) return 0.6
  if (distance === 2) return 0.45
  return 0.3
}

export function OnboardingChecklist({
  notificationsDone,
  vaultDone,
  apiKeyDone,
  agentDone,
  onEnableNotifications,
  onSkipNotifications,
  onDismiss,
}: OnboardingChecklistProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  useEffect(() => {
    analytics.capture('identity', 'onboarding-viewed')
  }, [])

  const steps: { key: StepKey; title: string; desc: string; done: boolean }[] = [
    {
      key: 'notifications',
      title: t('dashboard.onboarding.notificationsTitle'),
      desc: t('dashboard.onboarding.notificationsDesc'),
      done: notificationsDone,
    },
    {
      key: 'vault',
      title: t('dashboard.onboarding.vaultTitle'),
      desc: t('dashboard.onboarding.vaultDesc'),
      done: vaultDone,
    },
    {
      key: 'apiKey',
      title: t('dashboard.onboarding.apiKeyTitle'),
      desc: t('dashboard.onboarding.apiKeyDesc'),
      done: apiKeyDone,
    },
    {
      key: 'agent',
      title: t('dashboard.onboarding.agentTitle'),
      desc: t('dashboard.onboarding.agentDesc'),
      done: agentDone,
    },
  ]

  const completedCount = steps.filter((s) => s.done).length
  const pct = Math.round((completedCount / steps.length) * 100)
  // First incomplete step drives the active highlight; -1 once everything's done.
  const activeIndex = steps.findIndex((s) => !s.done)

  function handleEnable() {
    analytics.capture('identity', 'onboarding-notifications-enabled')
    onEnableNotifications()
  }

  function handleNotifSkip() {
    analytics.capture('identity', 'onboarding-notifications-skipped')
    onSkipNotifications()
  }

  function handleCtaForStep(key: StepKey) {
    if (key === 'vault') {
      analytics.capture('identity', 'onboarding-vault-clicked')
      void navigate({ to: '/vaults' })
    } else if (key === 'apiKey') {
      analytics.capture('identity', 'onboarding-api-key-clicked')
      void navigate({ to: '/api-keys' })
    } else if (key === 'agent') {
      analytics.capture('identity', 'onboarding-agent-clicked')
      void navigate({ to: '/agents' })
    }
  }

  function handleSkipSetup() {
    analytics.capture('identity', 'onboarding-skipped')
    onDismiss()
  }

  return (
    <div>
      {/* Progress header */}
      <div className="mb-2 rounded-xl bg-[var(--cv-card-bg)] p-4 shadow-sm">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-[var(--cv-t1)]">
              {t('dashboard.onboarding.title')}
            </span>
            <span className="text-xs text-[var(--cv-t3)]">
              {t('dashboard.onboarding.completed', {
                done: completedCount,
                total: steps.length,
              })}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-xs text-[var(--cv-t3)]">{pct}%</span>
            <button
              type="button"
              onClick={handleSkipSetup}
              className="text-[10px] font-medium text-[var(--cv-t3)] underline underline-offset-2 hover:text-[var(--cv-t2)]"
            >
              {t('dashboard.onboarding.skipSetup')}
            </button>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[rgb(var(--cv-primary-rgb)/0.15)]">
          <div
            className="h-full rounded-full bg-[var(--cv-primary)] transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {steps.map((step, index) => {
          const isActive = index === activeIndex
          const visual = STEP_VISUALS[step.key]
          const opacity = isActive
            ? 1
            : step.done
              ? 0.6
              : futureOpacity(index - activeIndex)

          return (
            <div
              key={step.key}
              className={`rounded-xl bg-[var(--cv-card-bg)] p-[18px] shadow-sm ${
                isActive ? 'border border-amber-500/30' : ''
              }`}
              style={{ opacity }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
                  style={{ backgroundColor: `${visual.color}26` }}
                >
                  <Icon name={visual.icon} size={18} color={visual.color} />
                </span>
                <div className="flex flex-1 flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-[var(--cv-t1)]">
                      {step.title}
                    </span>
                    {step.done ? (
                      <Icon
                        name="check_circle"
                        size={18}
                        color="#10B981"
                      />
                    ) : (
                      <span className="rounded-md bg-[var(--cv-card-footer)] px-2 py-0.5 text-[10px] font-semibold text-[var(--cv-t3)]">
                        {t('dashboard.onboarding.stepBadge', { n: index + 1 })}
                      </span>
                    )}
                  </div>
                  <span className="text-xs leading-relaxed text-[var(--cv-t3)]">
                    {step.desc}
                  </span>
                  {isActive && step.key === 'notifications' && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleEnable}>
                        {t('dashboard.onboarding.enable')}
                      </Button>
                      <Button
                        variant="subtle"
                        size="sm"
                        onClick={handleNotifSkip}
                      >
                        {t('dashboard.onboarding.skip')}
                      </Button>
                    </div>
                  )}
                  {isActive && step.key !== 'notifications' && (
                    <div className="flex">
                      <Button
                        size="sm"
                        onClick={() => handleCtaForStep(step.key)}
                      >
                        {t(`dashboard.onboarding.cta.${step.key}`)}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
