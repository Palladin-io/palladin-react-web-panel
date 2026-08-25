import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import { useAuthStore } from '../stores/auth-store'

const MAX_TIMEOUT_MS = 2_147_483_647

export function WaitlistDeveloperBenefitBanner() {
  const { t, i18n } = useTranslation()
  const startedAt = useAuthStore(
    (state) => state.waitlistDeveloperBenefitStartedAt,
  )
  const endsAt = useAuthStore(
    (state) => state.waitlistDeveloperBenefitEndsAt,
  )
  const [now, setNow] = useState(() => Date.now())

  const period = useMemo(() => {
    if (!startedAt || !endsAt) return null
    const startsAtMs = Date.parse(startedAt)
    const endsAtMs = Date.parse(endsAt)
    if (!Number.isFinite(startsAtMs)
      || !Number.isFinite(endsAtMs)
      || startsAtMs >= endsAtMs
      || endsAtMs <= now) {
      return null
    }
    return { startsAtMs, endsAtMs }
  }, [endsAt, now, startedAt])

  useEffect(() => {
    if (!period) return
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(period.endsAtMs - Date.now(), MAX_TIMEOUT_MS),
    )
    return () => window.clearTimeout(timeout)
  }, [period])

  if (!period) return null

  const locale = i18n.resolvedLanguage?.startsWith('pl') ? 'pl-PL' : 'en-GB'
  const formatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  return (
    <section
      aria-labelledby="waitlist-developer-benefit-title"
      className="sticky top-0 z-30 mx-4 mt-4 flex items-start gap-3 rounded-xl border border-[rgb(var(--cv-premium-rgb)/0.28)] bg-[color-mix(in_srgb,var(--cv-card-bg)_88%,transparent)] px-4 py-3 shadow-sm backdrop-blur-md"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--cv-premium-rgb)/0.12)]">
        <Icon name="workspace_premium" size={16} color="var(--cv-premium)" />
      </span>
      <div className="min-w-0">
        <p
          id="waitlist-developer-benefit-title"
          className="text-ui font-semibold text-[var(--cv-premium)]"
        >
          {t('waitlistBenefit.title')}
        </p>
        <p className="mt-0.5 text-meta leading-relaxed text-[var(--cv-t2)]">
          {t('waitlistBenefit.period', {
            startsAt: formatter.format(period.startsAtMs),
            endsAt: formatter.format(period.endsAtMs),
          })}{' '}
          <span className="text-[var(--cv-t3)]">
            {t('waitlistBenefit.terms')}
          </span>
        </p>
      </div>
    </section>
  )
}
