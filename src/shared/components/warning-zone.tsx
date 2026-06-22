import type { ReactNode } from 'react'

export interface WarningZoneProps {
  /** Short uppercase heading, e.g. "Warning zone". */
  title: string
  children: ReactNode
}

/**
 * The app's default "warning zone" callout — an amber section with an uppercase
 * title and a body line. Use it for any in-form caution (risky option selected,
 * irreversible choice, security trade-off). Standardised so every warning reads
 * the same; the reference is the `exec`/`get` method warning and the Lifetime
 * grant warning.
 */
export function WarningZone({ title, children }: WarningZoneProps) {
  return (
    <section
      role="alert"
      className="rounded-xl border border-[rgba(212,130,10,0.3)] bg-[rgba(212,130,10,0.06)] p-3
        dark:border-[rgba(240,192,64,0.3)] dark:bg-[rgba(240,192,64,0.08)]"
    >
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#D4820A] dark:text-[#F0C040]">
        {title}
      </h3>
      <p className="mt-1 text-[11px] leading-snug text-[var(--cv-t2)]">{children}</p>
    </section>
  )
}
