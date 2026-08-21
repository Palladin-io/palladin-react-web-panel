import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DetailTabBar } from '../../../shared/components/detail-tab-bar'

export type ApiKeyDetailTab = 'details' | 'agents'

export interface ApiKeyDetailTabsProps {
  active: ApiKeyDetailTab
  onChange: (next: ApiKeyDetailTab) => void
  /** Wide-mode reserves the canonical detail-row height. */
  wide?: boolean
  leading?: ReactNode
}

/**
 * Tab strip for the API key detail panel. It delegates layout to the
 * canonical detail tab bar so all split views share one baseline.
 */
export function ApiKeyDetailTabs({
  active,
  onChange,
  wide,
  leading,
}: ApiKeyDetailTabsProps) {
  const { t } = useTranslation()
  const tabs: { id: ApiKeyDetailTab; label: string }[] = [
    { id: 'details', label: t('apiKeys.detail.detailsTab') },
    { id: 'agents', label: t('apiKeys.detail.agentsTab') },
  ]

  return (
    <DetailTabBar
      tabs={tabs}
      active={active}
      onChange={onChange}
      ariaLabel={t('apiKeys.detail.tabsLabel')}
      wide={wide}
      leading={leading}
    />
  )
}
