import { useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { ModalShell } from '../../../shared/components/modal-shell'
import { useAuthStore } from '../stores/auth-store'
import {
  deriveWaitlistDeveloperBenefitPeriodId,
  isWaitlistDeveloperBenefitActive,
  readWaitlistDeveloperBenefitAcknowledgement,
  writeWaitlistDeveloperBenefitAcknowledgement,
} from '../lib/waitlist-developer-benefit'

const MAX_TIMEOUT_MS = 2_147_483_647

export function WaitlistDeveloperBenefitDialog() {
  const { t, i18n } = useTranslation()
  const startedAt = useAuthStore(
    (state) => state.waitlistDeveloperBenefitStartedAt,
  )
  const endsAt = useAuthStore(
    (state) => state.waitlistDeveloperBenefitEndsAt,
  )
  const userId = useAuthStore((state) => state.userId)
  const [acceptedPeriod, setAcceptedPeriod] = useState(
    readWaitlistDeveloperBenefitAcknowledgement,
  )
  const [derivedPeriod, setDerivedPeriod] = useState<{
    source: string
    id: string
  } | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const period = useMemo(() => {
    if (!startedAt || !endsAt) return null
    const endsAtMs = Date.parse(endsAt)
    if (!isWaitlistDeveloperBenefitActive(startedAt, endsAt, now)) return null
    return {
      startedAt,
      endsAt,
      endsAtMs,
    }
  }, [endsAt, now, startedAt])

  const periodSource = period && userId
    ? `${userId}\u0000${period.startedAt}\u0000${period.endsAt}`
    : null

  useEffect(() => {
    let cancelled = false
    if (!period || !periodSource || !userId) return () => { cancelled = true }

    void deriveWaitlistDeveloperBenefitPeriodId(
      userId,
      period.startedAt,
      period.endsAt,
    ).then((id) => {
      if (!cancelled) setDerivedPeriod({ source: periodSource, id })
    })

    return () => { cancelled = true }
  }, [period, periodSource, userId])

  const periodId = derivedPeriod?.source === periodSource
    ? derivedPeriod.id
    : null

  useEffect(() => {
    if (!period) return
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(period.endsAtMs - Date.now(), MAX_TIMEOUT_MS),
    )
    return () => window.clearTimeout(timeout)
  }, [period])

  if (!period || !periodId || acceptedPeriod === periodId) return null

  const locale = i18n.resolvedLanguage?.startsWith('pl') ? 'pl-PL' : 'en-GB'
  const formatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const congratulations = t('waitlistBenefit.congratulations')

  const accept = () => {
    writeWaitlistDeveloperBenefitAcknowledgement(periodId)
    setAcceptedPeriod(periodId)
  }

  return (
    <ModalShell
      ariaLabel={congratulations}
      width={420}
      title={congratulations}
      titleClassName="text-page-title"
      trapFocus
      footerClassName="bg-[var(--cv-bg-subtle)]"
      footer={
        <DialogFooter>
          <Button variant="accent" size="sm" onClick={accept} className="w-full">
            {t('waitlistBenefit.cta')}
          </Button>
        </DialogFooter>
      }
    >
      <div className="relative isolate flex flex-col gap-4 overflow-hidden py-2 text-center">
        <BenefitConfetti />
        <h3 className="relative z-10 text-heading font-semibold text-[var(--cv-t1)]">
          <Trans
            i18nKey="waitlistBenefit.title"
            components={{
              premium: (
                <span
                  data-premium-word
                  className="font-bold"
                  style={{ color: 'var(--cv-premium)' }}
                />
              ),
            }}
          />
        </h3>
        <p className="relative z-10 text-ui leading-relaxed text-[var(--cv-t2)]">
          {t('waitlistBenefit.description', {
            endsAt: formatter.format(period.endsAtMs),
          })}
        </p>
        <p className="relative z-10 text-meta text-[var(--cv-t3)]">
          {t('waitlistBenefit.terms')}
        </p>
      </div>
    </ModalShell>
  )
}

const CONFETTI = [
  ['2%', '2%', 'var(--cv-primary)', '0ms', '-18deg'],
  ['9%', '13%', 'var(--cv-premium)', '40ms', '28deg'],
  ['16%', '4%', 'var(--cv-info)', '90ms', '-42deg'],
  ['23%', '17%', 'var(--cv-success)', '140ms', '18deg'],
  ['30%', '1%', 'var(--cv-script)', '30ms', '52deg'],
  ['37%', '12%', 'var(--cv-pending)', '180ms', '-30deg'],
  ['44%', '3%', 'var(--cv-premium)', '220ms', '38deg'],
  ['51%', '15%', 'var(--cv-primary)', '75ms', '-54deg'],
  ['58%', '1%', 'var(--cv-success)', '260ms', '24deg'],
  ['65%', '13%', 'var(--cv-info)', '115ms', '-16deg'],
  ['72%', '4%', 'var(--cv-premium)', '200ms', '48deg'],
  ['79%', '17%', 'var(--cv-script)', '55ms', '-36deg'],
  ['86%', '2%', 'var(--cv-primary)', '150ms', '30deg'],
  ['94%', '11%', 'var(--cv-pending)', '235ms', '-50deg'],
  ['3%', '31%', 'var(--cv-info)', '110ms', '20deg'],
  ['12%', '45%', 'var(--cv-success)', '250ms', '-44deg'],
  ['4%', '61%', 'var(--cv-premium)', '65ms', '34deg'],
  ['17%', '77%', 'var(--cv-primary)', '190ms', '-22deg'],
  ['7%', '91%', 'var(--cv-script)', '280ms', '46deg'],
  ['25%', '87%', 'var(--cv-pending)', '120ms', '-38deg'],
  ['75%', '88%', 'var(--cv-success)', '35ms', '26deg'],
  ['91%', '92%', 'var(--cv-premium)', '170ms', '-48deg'],
  ['82%', '76%', 'var(--cv-info)', '225ms', '40deg'],
  ['96%', '63%', 'var(--cv-primary)', '80ms', '-28deg'],
  ['87%', '48%', 'var(--cv-script)', '270ms', '18deg'],
  ['96%', '33%', 'var(--cv-pending)', '135ms', '-52deg'],
  ['34%', '92%', 'var(--cv-premium)', '210ms', '32deg'],
  ['63%', '91%', 'var(--cv-primary)', '95ms', '-34deg'],
] as const

function BenefitConfetti() {
  return (
    <div
      aria-hidden
      data-testid="benefit-confetti"
      className="pointer-events-none absolute inset-0 z-0"
    >
      {CONFETTI.map((piece) => (
        <span
          key={`${piece[0]}-${piece[1]}`}
          className="benefit-confetti-piece"
          style={{
            left: piece[0],
            top: piece[1],
            backgroundColor: piece[2],
            animationDelay: piece[3],
            transform: `rotate(${piece[4]})`,
          }}
        />
      ))}
    </div>
  )
}
