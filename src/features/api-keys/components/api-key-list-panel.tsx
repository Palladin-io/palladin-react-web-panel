import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import { HOVERABLE_CARD_CLASSES } from '../../../shared/lib/styles'
import type { ApiKeySummary } from '../api/api-keys-api'
import { useApiKeyPermissions, useApiKeys } from '../use-api-keys'
import { GenerateApiKeyModal } from './generate-api-key-modal'

export interface ApiKeyListPanelProps {
  /** API key currently shown in the right detail panel (split-view). */
  selectedApiKeyId?: string
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Compact status pill mirroring the detail panel badge. */
export function ApiKeyStatusBadge({ status }: { status: ApiKeySummary['status'] }) {
  const { t } = useTranslation()
  const isActive = status === 'active'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px]
        font-semibold ${
        isActive
          ? 'bg-[rgba(16, 185, 129,0.14)] text-[#10B981]'
          : 'bg-[rgb(var(--cv-primary-rgb)/0.12)] text-[var(--cv-primary)]'
      }`}
    >
      {isActive ? t('apiKeys.statusActive') : t('apiKeys.statusRevoked')}
    </span>
  )
}

/**
 * Left-side master panel of the API Keys split view: a header with the
 * Generate CTA and the scrollable list of keys. Each row links to
 * `/api-keys/$keyId`; the currently viewed key is highlighted with the
 * shared selected-row treatment. Owns its own generate modal so the
 * right-side detail panel has no knowledge of the left side's lifecycle.
 */
export function ApiKeyListPanel({ selectedApiKeyId }: ApiKeyListPanelProps) {
  const { t } = useTranslation()
  const keys = useApiKeys()
  const { canWrite } = useApiKeyPermissions()
  const [generateOpen, setGenerateOpen] = useState(false)

  const list = useMemo(() => keys.data ?? [], [keys.data])

  return (
    <>
      <div className="mb-4 flex h-10 items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-bold text-[var(--cv-t1)]">
            {t('apiKeys.sectionTitle')}
          </h2>
          <p className="text-[11px] text-[var(--cv-t3)]">
            {t('apiKeys.countLabel', { count: list.length })}
          </p>
        </div>
        {canWrite ? (
          <Button
            variant="accent"
            size="sm"
            icon="add"
            onClick={() => setGenerateOpen(true)}
          >
            {t('apiKeys.generate')}
          </Button>
        ) : null}
      </div>

      {keys.isPending ? (
        <PanelLoadingSkeleton />
      ) : keys.isError ? (
        <ErrorState message={t('apiKeys.errorLoad')} onRetry={keys.refetch} />
      ) : list.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 rounded-2xl border border-dashed
            border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-8 text-center"
        >
          <Icon name="key" size={28} color="var(--cv-t3)" />
          <p className="text-[12px] text-[var(--cv-t3)]">{t('apiKeys.empty')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((key) => (
            <li key={key.apiKeyId}>
              <ApiKeyRow
                apiKey={key}
                isSelected={key.apiKeyId === selectedApiKeyId}
              />
            </li>
          ))}
        </ul>
      )}

      <GenerateApiKeyModal open={generateOpen} onClose={() => setGenerateOpen(false)} />
    </>
  )
}

interface ApiKeyRowProps {
  apiKey: ApiKeySummary
  isSelected: boolean
}

function ApiKeyRow({ apiKey, isSelected }: ApiKeyRowProps) {
  return (
    <Link
      to="/api-keys/$keyId"
      params={{ keyId: apiKey.apiKeyId }}
      className={`flex flex-col overflow-hidden ${HOVERABLE_CARD_CLASSES}${
        isSelected ? ' !border-[var(--cv-t1)] bg-[var(--cv-btn-subtle-bg)]' : ''
      }`}
    >
      <div className="flex flex-col gap-1 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-[var(--cv-t1)]">
            {apiKey.name}
          </span>
          <ApiKeyStatusBadge status={apiKey.status} />
        </div>
        <span className="font-mono text-[11px] text-[var(--cv-t3)]">
          pl_••••{apiKey.keySuffix || '••••'}
        </span>
      </div>
      <div className="flex items-center justify-end border-t border-[var(--cv-divider)] bg-[var(--cv-card-footer)] px-4 py-2">
        <span className="text-[11px] text-[var(--cv-t3)]">
          {formatDate(apiKey.createdAt)}
        </span>
      </div>
    </Link>
  )
}

function PanelLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[58px] animate-pulse rounded-2xl bg-[var(--cv-card-bg)]"
        />
      ))}
    </div>
  )
}
