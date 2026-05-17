import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export type ApiKeyDetailTab = 'details' | 'agents'

export interface ApiKeyDetailTabsProps {
  active: ApiKeyDetailTab
  onChange: (next: ApiKeyDetailTab) => void
  /** Wide-mode renders the gradient line + actions slot; narrow stacks plainly. */
  wide?: boolean
  /** Tab-specific action buttons rendered on the right of the strip (wide only). */
  actions?: ReactNode
}

/**
 * Tab strip for the API key detail panel. `Details` is the only live
 * tab; `Agents` is a placeholder that renders a "coming soon" card until
 * its dedicated subtask lands. Mirrors the entry-detail tab strip so the
 * two split-view screens read identically.
 */
export function ApiKeyDetailTabs({
  active,
  onChange,
  wide,
  actions,
}: ApiKeyDetailTabsProps) {
  const { t } = useTranslation()
  const tabs: { id: ApiKeyDetailTab; labelKey: string }[] = [
    { id: 'details', labelKey: 'apiKeys.detail.detailsTab' },
    { id: 'agents', labelKey: 'apiKeys.detail.agentsTab' },
  ]

  const tabButtons = tabs.map((tab) => {
    const isActive = tab.id === active
    return (
      <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={isActive}
        onClick={() => onChange(tab.id)}
        className={`-mb-px border-b-2 px-3.5 py-2 text-[12px] transition-colors ${
          isActive
            ? 'border-[#FF4F4F] font-bold text-[#FF4F4F]'
            : 'border-transparent font-medium text-[var(--cv-t3)] hover:text-[var(--cv-t1)]'
        }`}
      >
        {t(tab.labelKey)}
      </button>
    )
  })

  if (wide) {
    return (
      <div className="mb-4 flex h-10 items-end">
        <div className="flex shrink-0 border-b border-[var(--cv-divider)]" role="tablist">
          {tabButtons}
        </div>
        <div className="h-px flex-1 self-end bg-gradient-to-r from-[var(--cv-divider)] to-transparent" />
        {actions ? (
          <div className="flex shrink-0 self-center items-center gap-1">{actions}</div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mb-3 flex border-b border-[var(--cv-divider)]" role="tablist">
      {tabButtons}
    </div>
  )
}
