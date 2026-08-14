import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import type { PendingGrant } from '../api/pending-grants-api'
import type { GrantPolicyBody } from '../grant-policy'
import type { GrantMethod } from '../grant-methods'
import { useApproveGrant } from '../use-approve-grant'
import { StaleGrantReviewError } from '../use-approve-grant'
import { useGrantApprovalReview } from '../use-grant-approval-review'
import { useDenyGrant } from '../use-deny-grant'
import { usePendingGrants } from '../use-pending-grants'
import { ApproveGrantDialog } from './approve-grant-dialog'
import { DenyGrantDialog } from './deny-grant-dialog'
import { formatGrantDate, formatRelativeTime } from './grant-format'
import { ModalShell } from '../../../shared/components/modal-shell'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { useMemberSyncStore } from '../../../shared/stores/member-sync-store'

export interface PendingGrantsPanelProps {
  /**
   * `list` = vertical stack (default; the Approvals/Inbox queue).
   * `carousel` = horizontal scroll-snap row of fixed-width cards (dashboard).
   * Only the container/card-wrapper changes — the card, mutations, and dialogs
   * are identical across both.
   */
  variant?: 'list' | 'carousel'
  /** When set, a "View all →" link renders in the header pointing at this route. */
  viewAllTo?: string
}

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
export function PendingGrantsPanel({
  variant = 'list',
  viewAllTo,
}: PendingGrantsPanelProps = {}) {
  const { t } = useTranslation()
  const pending = usePendingGrants()
  const approve = useApproveGrant()
  const deny = useDenyGrant()

  const [approveTarget, setApproveTarget] = useState<PendingGrant | null>(null)
  const [denyTarget, setDenyTarget] = useState<PendingGrant | null>(null)
  const review = useGrantApprovalReview(approveTarget)
  const memberVaults = useMemberSyncStore((state) => state.vaults)

  const items = pending.data ?? []
  const resolveGrant = (grant: PendingGrant): PendingGrant => {
    const vault = memberVaults.get(grant.vaultId)
    const entry = grant.entryId ? vault?.entries.get(grant.entryId) : undefined
    return {
      ...grant,
      entryLabel: !entry?.corrupt ? entry?.payload?.memberLabel ?? null : null,
    }
  }

  function handleApprove(grant: PendingGrant, policy: GrantPolicyBody, methods: GrantMethod[], fieldIds: string[]) {
    if (!review.data) return
    approve.mutate(
      {
        grantId: grant.id,
        agentId: grant.agentId,
        vaultId: grant.vaultId,
        entryId: grant.entryId,
        policy,
        methods,
        fieldIds,
        reviewedEntryRevision: review.data.entryRevision,
        requestedMethods: grant.encryptedReason.descriptor.binding.requestedMethods,
      },
      {
        onSuccess: () => {
          toast.success(t('grants.approve.success'))
          setApproveTarget(null)
        },
        onError: (error) => toast.error(t(error instanceof StaleGrantReviewError
          ? 'grants.approve.staleReview'
          : 'grants.approve.error')),
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
          <h2 className="truncate text-heading font-bold text-[var(--cv-t1)]">
            {t('grants.pending.title')}
          </h2>
          <p className="text-meta text-[var(--cv-t3)]">
            {t('grants.pending.subtitle')}
          </p>
        </div>
        {viewAllTo && (
          <Link
            to={viewAllTo}
            className="shrink-0 text-meta font-medium text-[var(--cv-primary)] hover:underline"
          >
            {t('grants.pending.viewAll')}
          </Link>
        )}
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
          <p className="text-ui font-medium text-[var(--cv-t3)]">
            {t('grants.pending.empty')}
          </p>
          <p className="text-meta text-[var(--cv-t3)]">
            {t('grants.pending.emptyHint')}
          </p>
        </div>
      ) : variant === 'carousel' ? (
        // Horizontal scroll-snap row of fixed-width cards; hidden scrollbar.
        <ul
          className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]
            [&::-webkit-scrollbar]:hidden snap-x snap-mandatory"
        >
          {items.map((grant) => (
            <li key={grant.id} className="w-[22.5rem] shrink-0 snap-start">
              <PendingGrantCard
                grant={resolveGrant(grant)}
                onApprove={() => setApproveTarget(resolveGrant(grant))}
                onDeny={() => setDenyTarget(grant)}
                disabled={approve.isPending || deny.isPending}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-[0.625rem]">
          {items.map((grant) => (
            <li key={grant.id}>
              <PendingGrantCard
                grant={resolveGrant(grant)}
                onApprove={() => setApproveTarget(resolveGrant(grant))}
                onDeny={() => setDenyTarget(grant)}
                disabled={approve.isPending || deny.isPending}
              />
            </li>
          ))}
        </ul>
      )}

      {approveTarget && review.data && (
        <ApproveGrantDialog
          grant={approveTarget}
          review={review.data}
          isPending={approve.isPending}
          onConfirm={(policy, methods, fieldIds) => handleApprove(approveTarget, policy, methods, fieldIds)}
          onCancel={() => setApproveTarget(null)}
        />
      )}
      {approveTarget && !review.data ? (
        <ModalShell
          ariaLabel={t('grants.approve.title')}
          title={t('grants.approve.title')}
          onClose={() => setApproveTarget(null)}
          footer={<DialogFooter>
            <Button variant="subtle" size="sm" className="flex-1" onClick={() => setApproveTarget(null)}>
              {t('grants.cancel')}
            </Button>
          </DialogFooter>}
        >
          {review.isError ? (
            <ErrorState message={t('grants.approve.reviewUnavailable')} onRetry={() => review.refetch()} />
          ) : (
            <p className="text-ui text-[var(--cv-t3)]">{t('grants.approve.loadingReview')}</p>
          )}
        </ModalShell>
      ) : null}

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
      <div className="flex items-center gap-2.5 px-[0.875rem] py-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
            bg-[rgb(var(--cv-success-rgb)/0.12)]"
          aria-hidden
        >
          <Icon name="smart_toy" size={16} color="var(--cv-success)" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-heading-sm font-semibold text-[var(--cv-t1)]"
            title={`${t('grants.pending.grantIdLabel')}: ${grant.id}`}
          >
            {agentName}
          </p>
          <p className="truncate text-meta text-[var(--cv-t3)]">
            {t('grants.pending.requestsAccess')}
          </p>
        </div>
      </div>

      {/* Detail rows: aligned label column + value, all rows equal height. */}
      <div className="flex flex-col gap-2 border-t border-[var(--cv-divider)] px-[0.875rem] py-3">
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

      </div>

      <div
        className="flex items-center gap-2 border-t border-[var(--cv-divider)] px-[0.875rem] py-2
          bg-[var(--cv-card-footer)]"
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
    <div className="flex gap-3 text-meta leading-relaxed">
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
          className="h-[6rem] animate-pulse rounded-2xl bg-[var(--cv-card-bg)]"
        />
      ))}
    </div>
  )
}
