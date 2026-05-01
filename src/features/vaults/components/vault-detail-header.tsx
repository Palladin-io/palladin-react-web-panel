import type { ReactNode } from 'react'
import { Icon } from '../../../shared/components/icon'

export interface VaultDetailHeaderProps {
  title: string
  subtitle: string
  /** Action buttons rendered on the right side of the header. */
  actions?: ReactNode
  onBack: () => void
}

/**
 * Header row inside a vault detail page: back arrow + title + entry
 * count + slot for tab-specific action buttons. Mirrors the Astro
 * `VaultDetailHeader.astro` mark-up so the React detail page reads as
 * the design — back caret on the left, title block in the middle, and
 * an actions slot on the right that each tab fills with its own CTA.
 */
export function VaultDetailHeader({
  title,
  subtitle,
  actions,
  onBack,
}: VaultDetailHeaderProps) {
  return (
    <div className="mb-2 flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex h-8 w-8 items-center justify-center rounded-lg
            text-[#8A95A6] transition-colors hover:bg-[rgba(253,249,228,0.04)] hover:text-[#FDF9E4]"
        >
          <Icon name="arrow_back" size={18} />
        </button>
        <div className="min-w-0">
          <div className="truncate text-[20px] font-bold leading-tight text-[#FDF9E4]">
            {title}
          </div>
          <div className="mt-1 text-[12px] text-[#8A95A6]">{subtitle}</div>
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      ) : null}
    </div>
  )
}
