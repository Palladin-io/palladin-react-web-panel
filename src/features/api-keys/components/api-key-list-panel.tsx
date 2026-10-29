import { MetadataBadge } from '../../../shared/components/metadata-badge'
import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AddButton } from '../../../shared/components/add-button'
import { ErrorState } from '../../../shared/components/error-state'
import { ScrollArea } from '../../../shared/components/scroll-area'
import { Icon } from '../../../shared/components/icon'
import {
  NAVIGATION_ROW_CLASSES,
  ENTITY_ICON_FRAME_CLASSES,
  SELECTED_NAVIGATION_CARD_CLASSES,
  SETTINGS_MASTER_HEADER_CLASSES,
} from '../../../shared/lib/styles'
import type { ApiKeySummary } from '../api/api-keys-api'
import { useApiKeyPermissions, useApiKeys } from '../use-api-keys'
import { GenerateApiKeyModal } from './generate-api-key-modal'

export interface ApiKeyListPanelProps {
  /** API key currently shown in the right detail panel (split-view). */
  selectedApiKeyId?: string
}

/** Compact status pill mirroring the detail panel badge. */
export function ApiKeyStatusBadge({ status }: { status: ApiKeySummary['status'] }) {
  const { t } = useTranslation()
  const presentation = status === 'active'
    ? {
        color: 'var(--cv-success)',
        label: t('apiKeys.statusActive'),
      }
    : status === 'revoked'
      ? {
          color: 'var(--cv-primary)',
          label: t('apiKeys.statusRevoked'),
        }
      : {
          color: 'var(--cv-neutral)',
          label: t('apiKeys.statusUnknown'),
        }
  return (
    <MetadataBadge color={presentation.color}>{presentation.label}</MetadataBadge>
  )
}

/**
 * Left-side master panel of the API Keys split view: a header with the
 * Generate CTA and the scrollable list of keys. Each row links to
 * `/settings/api-keys/$keyId`; the currently viewed key is highlighted with the
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
    <div className="flex h-full min-h-0 flex-col">
      <div className={SETTINGS_MASTER_HEADER_CLASSES}>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-heading font-bold text-[var(--cv-t1)]">
            {t('apiKeys.sectionTitle')}
          </h2>
          <p className="text-meta text-[var(--cv-t3)]">
            {t('apiKeys.countLabel', { count: list.length })}
          </p>
        </div>
        {canWrite ? (
          <AddButton onClick={() => setGenerateOpen(true)} label={t('apiKeys.generate')} />
        ) : null}
      </div>

      <ScrollArea>
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
            <p className="text-ui text-[var(--cv-t3)]">{t('apiKeys.empty')}</p>
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
      </ScrollArea>

      <GenerateApiKeyModal open={generateOpen} onClose={() => setGenerateOpen(false)} />
    </div>
  )
}

interface ApiKeyRowProps {
  apiKey: ApiKeySummary
  isSelected: boolean
}

function ApiKeyRow({ apiKey, isSelected }: ApiKeyRowProps) {
  return (
    <Link
      to="/settings/api-keys/$keyId"
      params={{ keyId: apiKey.apiKeyId }}
      aria-current={isSelected ? 'page' : undefined}
      className={`flex items-center gap-3 px-3 py-3 ${NAVIGATION_ROW_CLASSES}${
        isSelected ? ` ${SELECTED_NAVIGATION_CARD_CLASSES}` : ''
      }`}
    >
      <span className={`${ENTITY_ICON_FRAME_CLASSES} size-8 text-[var(--cv-t3)]`} aria-hidden="true">
        <Icon name="key" size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-ui font-medium text-[var(--cv-t1)]">{apiKey.name}</span>
          <ApiKeyStatusBadge status={apiKey.status} />
        </div>
        <span className="block truncate font-mono text-meta text-[var(--cv-t3)]">
          pl_••••{apiKey.keySuffix || '••••'}
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
          className="h-[3.625rem] animate-pulse rounded-2xl bg-[var(--cv-card-bg)]"
        />
      ))}
    </div>
  )
}
