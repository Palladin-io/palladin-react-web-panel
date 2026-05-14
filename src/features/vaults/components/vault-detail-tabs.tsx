import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export type VaultDetailTab =
  | 'entries'
  | 'agents'
  | 'audit-log'
  | 'members'
  | 'settings'

export interface VaultDetailTabsProps {
  active: VaultDetailTab
  onChange: (next: VaultDetailTab) => void
  actions?: ReactNode
}

const TAB_KEYS: { id: VaultDetailTab; labelKey: string }[] = [
  { id: 'entries', labelKey: 'vault.detail.entriesTab' },
  { id: 'agents', labelKey: 'vault.detail.agentsTab' },
  { id: 'audit-log', labelKey: 'vault.detail.auditLogTab' },
  { id: 'members', labelKey: 'vault.detail.membersTab' },
  { id: 'settings', labelKey: 'vault.detail.settingsTab' },
]

/**
 * Horizontal tab bar used inside the vault detail page. Active tab is
 * underlined with the accent colour. Tab state lives in the page (not
 * the URL) — switching is local to the detail view, no router hop.
 */
export function VaultDetailTabs({ active, onChange, actions }: VaultDetailTabsProps) {
  const { t } = useTranslation()
  return (
    <div
      className="mb-3 flex border-b border-[var(--cv-divider)]"
      role="tablist"
    >
      {TAB_KEYS.map((tab) => {
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
      })}
      {actions ? (
        <div className="ml-auto flex items-center gap-1 self-center">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
