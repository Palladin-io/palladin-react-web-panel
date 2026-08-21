import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ErrorState } from '../../shared/components/error-state'
import { Icon } from '../../shared/components/icon'
import { ResponsiveMasterDetail } from '../../shared/components/responsive-master-detail'
import { ScrollArea } from '../../shared/components/scroll-area'
import { useWideScreen } from '../../shared/hooks/use-wide-screen'
import { ApiKeyAgentsTab } from './components/api-key-agents-tab'
import { ApiKeyDetail, ApiKeyDetailEmpty } from './components/api-key-detail'
import {
  ApiKeyDetailTabs,
  type ApiKeyDetailTab,
} from './components/api-key-detail-tabs'
import { ApiKeyListPanel } from './components/api-key-list-panel'
import { useApiKeys } from './use-api-keys'

export interface ApiKeysPageProps {
  /** Selected key from the route param; undefined on the bare settings section route. */
  keyId?: string
}

/**
 * API Keys settings section — a master/detail split view at `/settings/api-keys`.
 * The left panel lists every key; the right panel shows the selected
 * key's detail with a `Details` tab and a placeholder `Agents` tab.
 *
 * The selected key is derived from the shared `useApiKeys` list query
 * rather than a dedicated single-key fetch — the backend exposes no
 * by-id endpoint and the list is already cached by the left panel.
 *
 * On narrow screens the list and detail collapse to a single column:
 * `/settings/api-keys` shows the list and the nested key route shows the detail.
 */
export function ApiKeysPage({ keyId }: ApiKeysPageProps) {
  const { t } = useTranslation()
  const isWide = useWideScreen()
  const keys = useApiKeys()
  const [activeTab, setActiveTab] = useState<ApiKeyDetailTab>('details')

  const selectedKey = keyId
    ? keys.data?.find((k) => k.apiKeyId === keyId)
    : undefined

  const detailContent = renderDetail()

  function renderDetail() {
    if (!keyId) {
      return <ScrollArea><ApiKeyDetailEmpty /></ScrollArea>
    }

    return (
      <>
        <ApiKeyDetailTabs
          active={activeTab}
          onChange={setActiveTab}
          wide={isWide}
          leading={!isWide ? (
            <Link
              to="/settings/api-keys"
              className="flex h-action w-action items-center justify-center rounded-lg text-[var(--cv-t3)] hover:bg-[var(--cv-list-item-hover)]"
              aria-label={t('common.back')}
            >
              <Icon name="arrow_back" size={18} />
            </Link>
          ) : undefined}
        />
        <ScrollArea>
          {keys.isPending ? <DetailSkeleton /> : keys.isError ? (
            <ErrorState message={t('apiKeys.errorLoad')} onRetry={keys.refetch} />
          ) : !selectedKey ? (
            <div className="rounded-2xl border border-dashed border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-8 text-center text-ui text-[var(--cv-t3)]">
              {t('apiKeys.detail.notFound')}
            </div>
          ) : activeTab === 'details' ? (
            <ApiKeyDetail apiKey={selectedKey} />
          ) : activeTab === 'agents' ? (
            <ApiKeyAgentsTab apiKeyId={selectedKey.apiKeyId} />
          ) : null}
        </ScrollArea>
      </>
    )
  }

  return (
    <ResponsiveMasterDetail
      hasSelection={Boolean(keyId)}
      masterLabel={t('apiKeys.sectionTitle')}
      detailLabel={t('apiKeys.detail.panelLabel')}
      master={
        <div className="h-full px-4 pt-4 text-[var(--cv-t1)]">
          <ApiKeyListPanel selectedApiKeyId={keyId} />
        </div>
      }
      detail={
        <div className="flex h-full min-h-0 flex-col px-4 py-4 text-[var(--cv-t1)]">
          {detailContent}
        </div>
      }
    />
  )
}

function DetailSkeleton() {
  return (
    <div className="h-48 animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
  )
}
