import { Icon } from '../../../shared/components/icon'
import { Tooltip } from '../../../shared/components/tooltip'

export interface SectionHeaderProps {
  children: React.ReactNode
  hint?: string
  hintLabel?: string
}

/**
 * Section divider used across the entry form: a small muted label followed by a
 * thin rule. Matches the approved redesign's `[name ── line]` rhythm.
 */
export function SectionHeader({ children, hint, hintLabel }: SectionHeaderProps) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <span className="text-meta text-[var(--cv-label-text)]">{children}</span>
      {hint ? (
        <Tooltip content={hint} always className="flex shrink-0">
          <button
            type="button"
            aria-label={hintLabel ?? hint}
            className="flex h-5 w-5 items-center justify-center rounded-full text-[var(--cv-t3)]
              transition-colors hover:bg-[var(--cv-btn-ghost-hover)] hover:text-[var(--cv-t1)]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cv-info)]"
          >
            <Icon name="info" size={14} />
          </button>
        </Tooltip>
      ) : null}
      <span className="h-px flex-1 bg-[var(--cv-divider)]" />
    </div>
  )
}
