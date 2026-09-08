import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { Icon } from '../../../shared/components/icon'
import { analytics } from '../../../shared/lib/analytics'

export interface OnboardingChecklistProps {
  /** True once the user has at least one entry in any vault. */
  entryDone: boolean
  onRegisterAgent?: () => void
  agentDone: boolean
  /** True once the user has a mobile push device — hides the mobile step. */
  mobileRegistered: boolean
  /** True once the user skipped the mobile step (persisted by the page). */
  mobileSkipped: boolean
  /** Open the mobile-app download — the page owns the actual action. */
  onGetApp: () => void
  /** Skip the mobile step — the page persists the skip flag + re-renders. */
  onSkipMobile: () => void
  /** Dismiss the whole checklist — the page persists `onboarding_skipped`. */
  onDismiss: () => void
}

type StepKey = 'entry' | 'agent' | 'mobile'

/**
 * Per-step icon glyph + accent. The accent is an `--cv-onboard-step-*` rgb
 * triplet token (defined in index.css), so the glyph colour and its tint both
 * derive from one token — no raw hex in the component.
 */
const STEP_VISUALS: Record<StepKey, { icon: string; accentRgb: string }> = {
  entry: { icon: 'shield', accentRgb: 'var(--cv-onboard-step-vault-rgb)' },
  agent: { icon: 'smart_toy', accentRgb: 'var(--cv-onboard-step-agent-rgb)' },
  mobile: { icon: 'smartphone', accentRgb: 'var(--cv-onboard-step-mobile-rgb)' },
}

/** Opacity for a future, not-yet-active step, by distance from the active one. */
function futureOpacity(distance: number): number {
  if (distance === 1) return 0.6
  if (distance === 2) return 0.45
  return 0.3
}

export function OnboardingChecklist({
  entryDone,
  onRegisterAgent,
  agentDone,
  mobileRegistered,
  mobileSkipped,
  onGetApp,
  onSkipMobile,
  onDismiss,
}: OnboardingChecklistProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  useEffect(() => {
    analytics.capture('dashboard', 'onboarding-viewed')
  }, [])

  const steps: { key: StepKey; title: string; desc: string; done: boolean }[] = [
    {
      key: 'entry',
      title: t('dashboard.onboarding.entryTitle'),
      desc: t('dashboard.onboarding.entryDesc'),
      done: entryDone,
    },
    {
      key: 'agent',
      title: t('dashboard.onboarding.agentTitle'),
      desc: t('dashboard.onboarding.agentDesc'),
      done: agentDone,
    },
  ]
  // The mobile step is last and only shown when the user has no mobile device
  // and hasn't skipped — once a phone is registered it's irrelevant.
  if (!mobileRegistered && !mobileSkipped) {
    steps.push({
      key: 'mobile',
      title: t('dashboard.onboarding.mobileTitle'),
      desc: t('dashboard.onboarding.mobileDesc'),
      done: false,
    })
  }

  const completedCount = steps.filter((s) => s.done).length
  const pct = Math.round((completedCount / steps.length) * 100)
  // First incomplete step drives the active highlight; -1 once everything's done.
  const activeIndex = steps.findIndex((s) => !s.done)

  function handleGetApp() {
    analytics.capture('dashboard', 'onboarding-mobile-clicked')
    onGetApp()
  }

  function handleSkipMobile() {
    analytics.capture('dashboard', 'onboarding-mobile-skipped')
    onSkipMobile()
  }

  function handleCtaForStep(key: StepKey) {
    if (key === 'entry') {
      analytics.capture('dashboard', 'onboarding-entry-clicked')
      void navigate({ to: '/vaults' })
    } else if (key === 'agent') {
      analytics.capture('dashboard', 'onboarding-agent-clicked')
      onRegisterAgent?.()
    }
  }

  function handleSkipSetup() {
    analytics.capture('dashboard', 'onboarding-skipped')
    onDismiss()
  }

  return (
    <div>
      {/* Progress header */}
      <div className="mb-2 rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-4">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex flex-col gap-1.5">
            <span className="text-ui font-bold text-[var(--cv-t1)]">
              {t('dashboard.onboarding.title')}
            </span>
            <span className="text-meta text-[var(--cv-t3)]">
              {t('dashboard.onboarding.completed', {
                done: completedCount,
                total: steps.length,
              })}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-meta text-[var(--cv-t3)]">{pct}%</span>
            <Button variant="ghost" size="sm" onClick={handleSkipSetup}>
              {t('dashboard.onboarding.skipSetup')}
            </Button>
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
              className="rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-[1.125rem]"
              style={{ opacity }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex h-[2.125rem] w-[2.125rem] shrink-0 items-center justify-center rounded-[0.625rem]"
                  style={{ backgroundColor: `rgb(${visual.accentRgb} / 0.15)` }}
                >
                  <Icon name={visual.icon} size={18} color={`rgb(${visual.accentRgb})`} />
                </span>
                <div className="flex flex-1 flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-ui font-bold text-[var(--cv-t1)]">
                      {step.title}
                    </span>
                    {step.done ? (
                      <Icon
                        name="check_circle"
                        size={18}
                        color="var(--cv-success)"
                      />
                    ) : (
                      <span className="rounded-md bg-[var(--cv-card-footer)] px-2 py-0.5 text-micro font-semibold text-[var(--cv-t3)]">
                        {t('dashboard.onboarding.stepBadge', { n: index + 1 })}
                      </span>
                    )}
                  </div>
                  <span className="text-meta leading-relaxed text-[var(--cv-t3)]">
                    {step.desc}
                  </span>
                  {isActive && step.key === 'mobile' && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleGetApp}>
                        {t('dashboard.onboarding.getApp')}
                      </Button>
                      <Button variant="subtle" size="sm" onClick={handleSkipMobile}>
                        {t('dashboard.onboarding.skip')}
                      </Button>
                    </div>
                  )}
                  {isActive && step.key !== 'mobile' && (
                    <div className="flex">
                      <Button
                        size="sm"
                        onClick={() => handleCtaForStep(step.key)}
                        disabled={step.key === 'agent' && !onRegisterAgent}
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
