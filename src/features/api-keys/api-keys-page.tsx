import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorState } from '../../shared/components/error-state'
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
  /** Selected key from the route param; undefined on the bare `/api-keys` route. */
  keyId?: string
}

/**
 * Standalone API Keys screen — a master/detail split view at `/api-keys`.
 * The left panel lists every key; the right panel shows the selected
 * key's detail with a `Details` tab and a placeholder `Agents` tab.
 *
 * The selected key is derived from the shared `useApiKeys` list query
 * rather than a dedicated single-key fetch — the backend exposes no
 * by-id endpoint and the list is already cached by the left panel.
 *
 * On narrow screens the list and detail collapse to a single column:
 * `/api-keys` shows the list, `/api-keys/$keyId` shows the detail.
 */
export function ApiKeysPage({ keyId }: ApiKeysPageProps) {
  const { t } = useTranslation()
  const isWide = useWideScreen(1280)
  const keys = useApiKeys()
  const [activeTab, setActiveTab] = useState<ApiKeyDetailTab>('details')

  const selectedKey = keyId
    ? keys.data?.find((k) => k.apiKeyId === keyId)
    : undefined

  const detailContent = renderDetail()

  function renderDetail() {
    if (!keyId) {
      return <ApiKeyDetailEmpty />
    }
    if (keys.isPending) {
      return <DetailSkeleton />
    }
    if (keys.isError) {
      return <ErrorState message={t('apiKeys.errorLoad')} onRetry={keys.refetch} />
    }
    if (!selectedKey) {
      return (
        <div className="rounded-2xl border border-dashed border-[var(--cv-empty-border)]
          bg-[var(--cv-empty-bg)] p-8 text-center text-sm text-[var(--cv-t3)]">
          {t('apiKeys.detail.notFound')}
        </div>
      )
    }
    return (
      <>
        <ApiKeyDetailTabs active={activeTab} onChange={setActiveTab} wide={isWide} />
        {activeTab === 'details' ? <ApiKeyDetail apiKey={selectedKey} /> : null}
        {activeTab === 'agents' ? (
          <ApiKeyAgentsTab apiKeyId={selectedKey.apiKeyId} />
        ) : null}
      </>
    )
  }

  if (isWide) {
    return (
      <div className="flex h-full text-[var(--cv-t1)]">
        <div className="w-[clamp(300px,22vw,400px)] shrink-0 overflow-hidden border-r border-[var(--cv-border)]">
          <div className="h-full px-4 pt-4">
            <ApiKeyListPanel selectedApiKeyId={keyId} />
          </div>
        </div>
        <div className="subtle-scrollbar flex-1 overflow-y-auto min-w-0">
          <div className="px-4 py-4">{detailContent}</div>
        </div>
      </div>
    )
  }

  // Narrow: a single column. `/api-keys` shows the list,
  // `/api-keys/$keyId` shows the detail. Left-aligned, full-width (NO
  // `mx-auto max-w-*`) so it behaves like Agents/Vaults at small widths.
  return (
    <div className="min-h-full text-[var(--cv-t1)]">
      <div className="px-4 py-4">
        {keyId ? detailContent : <ApiKeyListPanel selectedApiKeyId={keyId} />}
      </div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <>
      <div className="mb-4 h-10 animate-pulse rounded-xl bg-[var(--cv-card-bg)]" />
      <div className="h-48 animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
    </>
  )
}
