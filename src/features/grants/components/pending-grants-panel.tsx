import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import type { PendingGrant } from '../api/pending-grants-api'
import { useApproveGrant } from '../use-approve-grant'
import { useDenyGrant } from '../use-deny-grant'
import { usePendingGrants } from '../use-pending-grants'
import { ApproveGrantDialog } from './approve-grant-dialog'
import { DenyGrantDialog } from './deny-grant-dialog'
import { formatGrantDate } from './grant-format'

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

  function handleApprove(
    grant: PendingGrant,
    policy: { expiresAt: string } | { queryLimit: number },
  ) {
    approve.mutate(
      {
        grantId: grant.grantId,
        vaultId: grant.vaultId,
        entryId: grant.entryId,
        agentPublicKey: grant.agentPublicKey,
        policy,
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
      { vaultId: grant.vaultId, grantId: grant.grantId, reason },
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
      <div className="mb-4">
        <h2 className="text-[14px] font-bold text-[var(--cv-t1)]">
          {t('grants.pending.title')}
        </h2>
        <p className="text-[11px] text-[var(--cv-t3)]">
          {t('grants.pending.subtitle')}
        </p>
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
            <li key={grant.grantId}>
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
          onConfirm={(policy) => handleApprove(approveTarget, policy)}
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
  const entryLabel = grant.entryLabel ?? t('grants.unknownTarget')
  const agentName = grant.agentName ?? t('grants.unknownAgent')

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]">
      <div className="px-[14px] py-3">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--cv-t1)]">
            {entryLabel}
          </p>
          <span className="shrink-0 text-[10px] text-[var(--cv-t3)]">
            {formatGrantDate(grant.createdAt)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-[var(--cv-t3)]">
          {agentName}
          {grant.vaultName ? ` · ${grant.vaultName}` : ''}
        </p>
        {grant.reason && (
          <p className="mt-2 rounded-lg bg-[var(--cv-bg-subtle)] px-2.5 py-1.5 text-[11px] text-[var(--cv-t2)]">
            {grant.reason}
          </p>
        )}
      </div>

      <div
        className="flex items-center gap-2 border-t border-[var(--cv-divider)] px-[14px] py-2
          bg-[rgba(0,11,46,0.015)] dark:bg-[rgba(253,249,228,0.02)]"
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
