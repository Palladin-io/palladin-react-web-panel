import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'

/** Rail shortcuts — the same destinations the onboarding CTAs lead to. */
const ACTIONS = [
  { key: 'vault', icon: 'shield', to: '/vaults' },
  { key: 'apiKey', icon: 'key', to: '/api-keys' },
  { key: 'agent', icon: 'smart_toy', to: '/agents' },
] as const

/**
 * "Quick actions" rail card — one-tap entry to the create flows for the three
 * core resources. Reuses the shared `Button`; no bespoke markup.
 */
export function QuickActionsCard() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <section className="rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-4">
      <h2 className="mb-3 text-[14px] font-bold text-[var(--cv-t1)]">
        {t('dashboard.quickActions.title')}
      </h2>
      <div className="flex flex-col gap-2">
        {ACTIONS.map((action) => (
          <Button
            key={action.key}
            variant="subtle"
            size="sm"
            icon={action.icon}
            className="w-full"
            onClick={() => navigate({ to: action.to })}
          >
            {t(`dashboard.quickActions.${action.key}`)}
          </Button>
        ))}
      </div>
    </section>
  )
}
