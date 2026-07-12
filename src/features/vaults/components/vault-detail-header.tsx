import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'

export interface VaultDetailHeaderProps {
  title: string
  subtitle: string
  /** Optional icon/avatar rendered between the back button and the title. */
  iconElement?: ReactNode
  /** Action buttons rendered on the right side of the header. */
  actions?: ReactNode
  /** When omitted, the back button is hidden (e.g. inside a split-view right panel). */
  onBack?: () => void
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
  iconElement,
  actions,
  onBack,
}: VaultDetailHeaderProps) {
  const { t } = useTranslation()
  return (
    <div className="mb-2 flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={t('common.back')}
            className="flex h-8 w-8 items-center justify-center rounded-lg
              text-[var(--cv-t3)] transition-colors hover:bg-[var(--cv-bg-subtle)] hover:text-[var(--cv-t1)]"
          >
            <Icon name="arrow_back" size={18} />
          </button>
        ) : null}
        {iconElement}
        <div className="min-w-0">
          <div className="truncate text-page-title font-bold leading-tight text-[var(--cv-t1)]">
            {title}
          </div>
          <div className="mt-1 text-ui text-[var(--cv-t3)]">{subtitle}</div>
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      ) : null}
    </div>
  )
}
