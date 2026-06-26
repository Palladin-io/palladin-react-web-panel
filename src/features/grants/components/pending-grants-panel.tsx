import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import { Tooltip } from '../../../shared/components/tooltip'
import type { PendingGrant } from '../api/pending-grants-api'
import type { GrantPolicyBody } from '../grant-policy'
import type { GrantMethod } from '../grant-methods'
import { useApproveGrant } from '../use-approve-grant'
import { useDenyGrant } from '../use-deny-grant'
import { usePendingGrants } from '../use-pending-grants'
import { ApproveGrantDialog } from './approve-grant-dialog'
import { DenyGrantDialog } from './deny-grant-dialog'
import { formatGrantDate, formatRelativeTime } from './grant-format'

/**
 * Pending approvals queue. Lists every GRANULAR grant awaiting the user's
 * decision (agent, requested entry, reason) and drives the approve/deny flows.
 *
 * Approve opens a dialog to choose the XOR access policy; on confirm the
 * approve hook performs the zero-knowledge envelope production. Deny opens a
 * lightweight reason dialog.
 *
 * The skeleton/empty/error states are confined to the list area.
 */
export function PendingGrantsPanel() {
  const { t } = useTranslation()
  const pending = usePendingGrants()
  const approve = useApproveGrant()
  const deny = useDenyGrant()

  const [approveTarget, setApproveTarget] = useState<PendingGrant | null>(null)
  const [denyTarget, setDenyTarget] = useState<PendingGrant | null>(null)

  const items = pending.data ?? []

  function handleApprove(grant: PendingGrant, policy: GrantPolicyBody, methods: GrantMethod[]) {
    approve.mutate(
      {
        grantId: grant.id,
        vaultId: grant.vaultId,
        entryId: grant.entryId,
        agentPublicKey: grant.agentPublicKey,
        policy,
        methods,
      },
      {
        onSuccess: () => {
          toast.success(t('grants.approve.success'))
          setApproveTarget(null)
        },
        onError: () => toast.error(t('grants.approve.error')),
      },
    )
  }

  function handleDeny(grant: PendingGrant, reason: string) {
    deny.mutate(
      { vaultId: grant.vaultId, grantId: grant.id, reason },
      {
        onSuccess: () => {
          toast.success(t('grants.deny.success'))
          setDenyTarget(null)
        },
        onError: () => toast.error(t('grants.deny.error')),
      },
    )
  }

  return (
    <>
      <div className="mb-4 flex h-10 items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-bold text-[var(--cv-t1)]">
            {t('grants.pending.title')}
          </h2>
          <p className="text-[11px] text-[var(--cv-t3)]">
            {t('grants.pending.subtitle')}
          </p>
        </div>
      </div>

      {pending.isPending ? (
        <PanelLoadingSkeleton />
      ) : pending.isError ? (
        <ErrorState message={t('grants.pending.errorLoad')} onRetry={pending.refetch} />
      ) : items.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 rounded-2xl border border-dashed
            border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-8 text-center"
        >
          <Icon name="check_circle" size={28} color="var(--cv-t3)" />
          <p className="text-[12px] font-medium text-[var(--cv-t3)]">
            {t('grants.pending.empty')}
          </p>
          <p className="text-[11px] text-[var(--cv-t3)]">
            {t('grants.pending.emptyHint')}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-[10px]">
          {items.map((grant) => (
            <li key={grant.id}>
              <PendingGrantCard
                grant={grant}
                onApprove={() => setApproveTarget(grant)}
                onDeny={() => setDenyTarget(grant)}
                disabled={approve.isPending || deny.isPending}
              />
            </li>
          ))}
        </ul>
      )}

      {approveTarget && (
        <ApproveGrantDialog
          grant={approveTarget}
          isPending={approve.isPending}
          onConfirm={(policy, methods) => handleApprove(approveTarget, policy, methods)}
          onCancel={() => setApproveTarget(null)}
        />
      )}

      <DenyGrantDialog
        open={denyTarget !== null}
        targetLabel={denyTarget?.entryLabel ?? t('grants.unknownTarget')}
        isPending={deny.isPending}
        onConfirm={(reason) => denyTarget && handleDeny(denyTarget, reason)}
        onCancel={() => setDenyTarget(null)}
      />
    </>
  )
}

function PendingGrantCard({
  grant,
  onApprove,
  onDeny,
  disabled,
}: {
  grant: PendingGrant
  onApprove: () => void
  onDeny: () => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  // Names are the primary content — never show a raw id as the main label.
  const entryLabel = grant.entryLabel ?? t('grants.unknownTarget')
  const agentName = grant.agentName ?? t('grants.unknownAgent')

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]">
      {/* Header: agent icon + name with "requests access" as a subtitle below
          (timestamp lives in the Requested row, not the corner). */}
      <div className="flex items-center gap-2.5 px-[14px] py-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
            bg-[rgba(16, 185, 129,0.12)]"
          aria-hidden
        >
          <Icon name="smart_toy" size={16} color="#10B981" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[13px] font-semibold text-[var(--cv-t1)]"
            title={`${t('grants.pending.grantIdLabel')}: ${grant.id}`}
          >
            {agentName}
          </p>
          <p className="truncate text-[11px] text-[var(--cv-t3)]">
            {t('grants.pending.requestsAccess')}
          </p>
        </div>
      </div>

      {/* Detail rows: aligned label column + value, all rows equal height. */}
      <div className="flex flex-col gap-2 border-t border-[var(--cv-divider)] px-[14px] py-3">
        <DetailRow label={t('grants.pending.rowEntry')}>
          {grant.entryId ? (
            <Link
              to="/vaults/$vaultId/entries/$entryId"
              params={{ vaultId: grant.vaultId, entryId: grant.entryId }}
              className="inline min-w-0 font-medium text-[var(--cv-t1)] underline-offset-2
                transition-colors hover:text-[var(--cv-primary)] hover:underline"
            >
              {entryLabel}
            </Link>
          ) : (
            <span className="font-medium text-[var(--cv-t1)]">{entryLabel}</span>
          )}
        </DetailRow>

        <DetailRow label={t('grants.pending.rowRequested')}>
          <span className="text-[var(--cv-t2)]" title={formatGrantDate(grant.createdAt)}>
            {formatRelativeTime(grant.createdAt, t)}
          </span>
        </DetailRow>

        {grant.reason && (
          <DetailRow label={t('grants.pending.rowReason')}>
            <Tooltip content={grant.reason} className="block truncate text-[var(--cv-t2)]">
              {grant.reason}
            </Tooltip>
          </DetailRow>
        )}
      </div>

      <div
        className="flex items-center gap-2 border-t border-[var(--cv-divider)] px-[14px] py-2
          bg-[rgba(12, 14, 18,0.045)] dark:bg-[rgba(232, 234, 237,0.06)]"
      >
        <Button
          variant="subtle"
          size="sm"
          onClick={onDeny}
          disabled={disabled}
          className="flex-1"
        >
          {t('grants.deny.action')}
        </Button>
        <Button
          variant="positive"
          size="sm"
          onClick={onApprove}
          disabled={disabled}
          className="flex-1"
        >
          {t('grants.approve.action')}
        </Button>
      </div>
    </div>
  )
}

/** One labelled row inside a pending card: muted fixed-width label + value. */
function DetailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3 text-[11px] leading-relaxed">
      <span className="w-20 shrink-0 font-medium text-[var(--cv-t3)]">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}

function PanelLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[96px] animate-pulse rounded-2xl bg-[var(--cv-card-bg)]"
        />
      ))}
    </div>
  )
}
