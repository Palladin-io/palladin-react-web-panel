import type { ReactNode } from 'react'

interface InfoZoneProps {
  title: string
  children: ReactNode
  className?: string
}

/** Calm, neutral counterpart of DangerZone for explanations that must not alarm. */
export function InfoZone({ title, children, className = '' }: InfoZoneProps) {
  return (
    <section className={`rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-4 ${className}`}>
      <h2 className="text-ui font-semibold text-[var(--cv-info)]">{title}</h2>
      <div className="mt-3 flex flex-col gap-2 text-meta text-[var(--cv-t3)]">{children}</div>
    </section>
  )
}
