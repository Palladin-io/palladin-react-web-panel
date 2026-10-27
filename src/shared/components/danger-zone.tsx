import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface DangerZoneProps {
  title: string
  description: string
  children: ReactNode
  className?: string
}

export function DangerZone({ title, description, children, className = '' }: DangerZoneProps) {
  const { t } = useTranslation()
  return (
    <section className={`rounded-xl border border-[var(--cv-primary)] bg-[var(--cv-card-bg)] p-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="flex flex-wrap items-center gap-2 text-ui font-semibold">
            <span className="text-[var(--cv-primary)]">{t('common.dangerZone')}</span>
            <span aria-hidden="true" className="text-[var(--cv-t3)]">|</span>
            <span className="text-[var(--cv-t1)]">{title}</span>
          </h2>
          <p className="mt-3 text-meta text-[var(--cv-t3)]">{description}</p>
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    </section>
  )
}
