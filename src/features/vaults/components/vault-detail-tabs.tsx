import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DetailTabBar } from '../../../shared/components/detail-tab-bar'

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
 * Horizontal tab bar used inside the vault detail page. The shared detail
 * tab bar keeps its underline and starting offset aligned with other panels.
 */
export function VaultDetailTabs({ active, onChange, actions }: VaultDetailTabsProps) {
  const { t } = useTranslation()

  return (
    <DetailTabBar
      tabs={TAB_KEYS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
      active={active}
      onChange={onChange}
      ariaLabel={t('vault.detail.tabsLabel')}
      wide={Boolean(actions)}
      actions={actions}
    />
  )
}
