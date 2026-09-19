import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ErrorState } from '../../../shared/components/error-state'
import { ScrollArea } from '../../../shared/components/scroll-area'
import { Icon } from '../../../shared/components/icon'
import { HOVERABLE_CARD_CLASSES } from '../../../shared/lib/styles'
import {
  GRANT_STATUSES,
  type Grant,
  type GrantStatus,
} from '../api/grants-api'
import { grantTypeLabelKey, grantStatusPresentation } from '../grant-presentation'
import { useVaultGrants } from '../use-vault-grants'
import { formatGrantDate } from './grant-format'

export interface GrantListPanelProps {
  vaultId: string
  /** Grant currently shown in the right detail panel (split-view). */
  selectedGrantId?: string
}

/** Status filter chips — `undefined` = all. */
function StatusFilter({
  value,
  onChange,
}: {
  value: GrantStatus | undefined
  onChange: (next: GrantStatus | undefined) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      <FilterChip active={value === undefined} onClick={() => onChange(undefined)}>
        {t('grants.filterAll')}
      </FilterChip>
      {GRANT_STATUSES.map((status) => (
        <FilterChip
          key={status}
          active={value === status}
          onClick={() => onChange(status)}
        >
          {t(grantStatusPresentation(status).labelKey)}
        </FilterChip>
      ))}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-micro font-semibold transition-colors ${
        active
          ? 'bg-[rgb(var(--cv-primary-rgb)/0.12)] text-[var(--cv-primary)]'
          : 'bg-[var(--cv-bg-subtle)] text-[var(--cv-t3)] hover:text-[var(--cv-t1)]'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Left-side master panel of the vault Grants split view: a header, a status
 * filter, and the scrollable grants list. The skeleton/empty/error states are
 * confined to the list area — the header and filter stay visible throughout.
 */
export function GrantListPanel({ vaultId, selectedGrantId }: GrantListPanelProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<GrantStatus | undefined>(undefined)
  const grants = useVaultGrants(vaultId, { status })

  const items = grants.data?.items ?? []

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex h-10 shrink-0 items-center">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-heading font-bold text-[var(--cv-t1)]">
            {t('grants.title')}
          </h2>
          <p className="text-meta text-[var(--cv-t3)]">{t('grants.subtitle')}</p>
        </div>
      </div>

      <div className="shrink-0">
        <StatusFilter value={status} onChange={setStatus} />
      </div>

      <ScrollArea>
        {grants.isPending ? (
          <PanelLoadingSkeleton />
        ) : grants.isError ? (
          <ErrorState message={t('grants.errorLoad')} onRetry={grants.refetch} />
        ) : items.length === 0 ? (
          <div
            className="flex flex-col items-center gap-2 rounded-2xl border border-dashed
              border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-8 text-center"
          >
            <Icon name="key" size={28} color="var(--cv-t3)" />
            <p className="text-ui font-medium text-[var(--cv-t3)]">
              {t('grants.empty')}
            </p>
            <p className="text-meta text-[var(--cv-t3)]">{t('grants.emptyHint')}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-[0.625rem]">
            {items.map((grant) => (
              <li key={grant.grantId}>
                <GrantCard
                  grant={grant}
                  vaultId={vaultId}
                  isSelected={grant.grantId === selectedGrantId}
                />
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}

function GrantCard({
  grant,
  vaultId,
  isSelected,
}: {
  grant: Grant
  vaultId: string
  isSelected: boolean
}) {
  const { t } = useTranslation()
  const presentation = grantStatusPresentation(grant.status)
  const target =
    grant.entryLabel ?? grant.agentName ?? t('grants.unknownTarget')

  return (
    <Link
      to="/vaults/$vaultId/grants/$grantId"
      params={{ vaultId, grantId: grant.grantId }}
      className={`block overflow-hidden px-[0.875rem] py-3 ${HOVERABLE_CARD_CLASSES}${
        isSelected ? ' !border-[var(--cv-t1)] bg-[var(--cv-btn-subtle-bg)]' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-heading-sm font-semibold text-[var(--cv-t1)]">
          {target}
        </p>
        <span
          className="inline-flex shrink-0 items-center gap-1 text-micro font-bold"
          style={{ color: presentation.color }}
        >
          ● {t(presentation.labelKey)}
        </span>
      </div>
      <p className="mt-0.5 truncate text-meta text-[var(--cv-t3)]">
        {grant.agentName ?? t('grants.unknownAgent')} ·{' '}
        {t(
          grantTypeLabelKey(grant.type),
        )}{' '}
        · {formatGrantDate(grant.createdAt)}
      </p>
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
