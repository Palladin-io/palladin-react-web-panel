import type { ReactNode } from 'react'
import { useWideScreen } from '../hooks/use-wide-screen'

export interface ResponsiveMasterDetailProps {
  master: ReactNode
  detail: ReactNode
  hasSelection: boolean
  masterLabel: string
  detailLabel: string
}

/**
 * Canonical list/detail layout. Wide screens show both columns; narrower
 * screens drill into the selected detail route and otherwise show the list.
 */
export function ResponsiveMasterDetail({
  master,
  detail,
  hasSelection,
  masterLabel,
  detailLabel,
}: ResponsiveMasterDetailProps) {
  const isWide = useWideScreen()

  if (!isWide) {
    return (
      <section className="h-full min-h-0" aria-label={hasSelection ? detailLabel : masterLabel}>
        {hasSelection ? detail : master}
      </section>
    )
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <section
        className="w-[clamp(18.75rem,22vw,25rem)] shrink-0 overflow-hidden border-r border-[var(--cv-border)]"
        aria-label={masterLabel}
      >
        {master}
      </section>
      <section className="min-w-0 flex-1 overflow-hidden" aria-label={detailLabel}>
        {detail}
      </section>
    </div>
  )
}
