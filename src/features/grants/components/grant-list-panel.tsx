import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import { HOVERABLE_CARD_CLASSES } from '../../../shared/lib/styles'
import {
  GRANT_STATUSES,
  type Grant,
  type GrantStatus,
} from '../api/grants-api'
import { grantStatusPresentation } from '../grant-presentation'
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
      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
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
    <>
      <div className="mb-4 flex h-10 items-center">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-bold text-[var(--cv-t1)]">
            {t('grants.title')}
          </h2>
          <p className="text-[11px] text-[var(--cv-t3)]">{t('grants.subtitle')}</p>
        </div>
      </div>

      <StatusFilter value={status} onChange={setStatus} />

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
          <p className="text-[12px] font-medium text-[var(--cv-t3)]">
            {t('grants.empty')}
          </p>
          <p className="text-[11px] text-[var(--cv-t3)]">{t('grants.emptyHint')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-[10px]">
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
    </>
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
      className={`block overflow-hidden px-[14px] py-3 ${HOVERABLE_CARD_CLASSES}${
        isSelected ? ' !border-[var(--cv-t1)] bg-[var(--cv-btn-subtle-bg)]' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--cv-t1)]">
          {target}
        </p>
        <span
          className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold"
          style={{ color: presentation.color }}
        >
          ● {t(presentation.labelKey)}
        </span>
      </div>
      <p className="mt-0.5 truncate text-[11px] text-[var(--cv-t3)]">
        {grant.agentName ?? t('grants.unknownAgent')} ·{' '}
        {t(
          grant.mode === 'full' ? 'grants.modeFull' : 'grants.modeGranular',
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
          className="h-[58px] animate-pulse rounded-2xl bg-[var(--cv-card-bg)]"
        />
      ))}
    </div>
  )
}
