import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface InfoZoneProps {
  title: string
  children: ReactNode
  className?: string
}

/** DangerZone's geometry in the calm `--cv-info` colour, for explanations that must not alarm. */
export function InfoZone({ title, children, className = '' }: InfoZoneProps) {
  const { t } = useTranslation()
  return (
    <section className={`rounded-xl border border-[var(--cv-info)] bg-[var(--cv-card-bg)] p-4 ${className}`}>
      <h2 className="flex flex-wrap items-center gap-2 text-ui font-semibold">
        <span className="text-[var(--cv-info)]">{t('common.infoZone')}</span>
        <span aria-hidden="true" className="text-[var(--cv-t3)]">|</span>
        <span className="text-[var(--cv-t1)]">{title}</span>
      </h2>
      <div className="mt-3 flex flex-col gap-2 text-meta text-[var(--cv-t3)]">{children}</div>
    </section>
  )
}
