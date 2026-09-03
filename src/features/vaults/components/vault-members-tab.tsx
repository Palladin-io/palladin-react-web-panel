import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { EmptyState } from '../../../shared/components/empty-state'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import { ModalShell } from '../../../shared/components/modal-shell'
import { SkeletonBlock } from '../../../shared/components/skeleton-block'
import { useInfiniteScroll } from '../../../shared/hooks/use-infinite-scroll'
import { shortenKey } from '../../../shared/lib/shorten-key'
import {
  PERMISSION_ORGANIZATION_MANAGEMENT,
  PERMISSION_VAULT_MANAGE,
} from '../../../shared/lib/permissions'
import { useAuthStore } from '../../auth'
import type { VaultMember } from '../api/vault-members-api'
import { usePendingRotations } from '../use-pending-rotations'
import { useRequestMemberRemoval, useVaultMembers } from '../use-vault-members'
import { useRotationStore } from '../rotation/rotation-store'

export function VaultMembersTab({
  vaultId,
  memberCount,
}: {
  vaultId: string
  memberCount: number
}) {
  const { t } = useTranslation()
  const permissions = useAuthStore((state) => state.permissions)
  const canView = (permissions & PERMISSION_VAULT_MANAGE) !== 0
  const canRemove = (permissions & PERMISSION_ORGANIZATION_MANAGEMENT) !== 0
  const members = useVaultMembers(vaultId, canView)
  const rotations = usePendingRotations(canView)
  const localRotation = useRotationStore()
  const removal = useRequestMemberRemoval(vaultId)
  const [selected, setSelected] = useState<VaultMember | null>(null)
  const [requestedIds, setRequestedIds] = useState<Set<string>>(() => new Set())
  const sentinelRef = useRef<HTMLDivElement>(null)

  const list = useMemo(
    () => members.data?.pages.flatMap((page) => page.items) ?? [],
    [members.data],
  )
  const pendingById = useMemo(
    () => new Map((rotations.data ?? []).map((rotation) => [rotation.id, rotation])),
    [rotations.data],
  )

  useInfiniteScroll(sentinelRef, {
    onLoadMore: members.fetchNextPage,
    enabled: Boolean(
      members.hasNextPage
      && !members.isFetchingNextPage
      && !members.isFetchNextPageError,
    ),
  })

  const confirmRemoval = () => {
    if (!selected) return
    const memberId = selected.memberId
    removal.mutate(memberId, {
      onSuccess: () => {
        setRequestedIds((current) => new Set(current).add(memberId))
        setSelected(null)
        toast.info(t('vault.members.removalRequested'))
      },
      onError: () => toast.error(t('vault.members.removalError')),
    })
  }

  if (!canView) return <EmptyState icon="lock" title={t('vault.members.noPermission')} />
  if (members.isPending) return <MembersSkeleton />
  if (members.isError && !members.data) {
    return <ErrorState message={t('vault.members.loadError')} onRetry={members.refetch} />
  }
  if (list.length === 0) {
    return <EmptyState icon="group" title={t('vault.members.empty')} />
  }

  return (
    <section aria-labelledby="vault-members-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="vault-members-heading" className="text-heading font-bold text-[var(--cv-t1)]">
          {t('vault.members.title')}
        </h2>
        <p className="mt-1 text-meta text-[var(--cv-t3)]">
          {t('vault.members.description')}
        </p>
      </div>

      {requestedIds.size > 0 || list.some((member) =>
        member.deprovisioningStatus === 'Pending'
        || member.deprovisioningStatus === 'WaitingForRotation') ? (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--cv-pending)] bg-[var(--cv-card-bg)] p-3">
          <Icon name="sync" size={18} color="var(--cv-pending)" className="mt-0.5 shrink-0" />
          <p className="text-meta text-[var(--cv-t2)]">{t('vault.members.rotationNotice')}</p>
        </div>
      ) : null}

      <ul className="flex flex-col gap-[0.625rem]" aria-label={t('vault.members.listLabel')}>
        {list.map((member) => {
          const optimisticPending = requestedIds.has(member.memberId)
            && member.deprovisioningStatus === 'Active'
          const status = optimisticPending ? 'Pending' : member.deprovisioningStatus
          const rotation = member.rotationId ? pendingById.get(member.rotationId) : undefined
          const isLocalRotation = member.rotationId === localRotation.rotationId
          const hasLease = Boolean(rotation?.leaseOwnerId && rotation.leaseExpiresAt)
          const localRetryRequired = isLocalRotation && localRotation.phase === 'error'
          const localProcessing = isLocalRotation && isProcessingPhase(localRotation.phase)
          const removable = canRemove && status === 'Active' && memberCount > 1

          return (
            <li key={member.memberId}>
              <article className="flex flex-col gap-3 rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-4 sm:flex-row sm:items-center">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--cv-info-rgb)/0.14)] text-[var(--cv-info)]">
                  <Icon name="person" size={22} color="var(--cv-info)" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-heading-sm font-semibold text-[var(--cv-t1)]">
                      {member.memberName?.trim() || shortenKey(member.memberId)}
                    </h3>
                    <StatusBadge status={status} />
                  </div>
                  <p className="mt-1 text-micro text-[var(--cv-t3)]">
                    {t('vault.members.memberId', { id: shortenKey(member.memberId) })}
                  </p>
                  {status !== 'Active' ? (
                    <p className="mt-1 text-meta text-[var(--cv-t2)]">
                      <StatusDetail
                        status={status}
                        retryRequired={Boolean(rotation?.lastFailureCode) || localRetryRequired}
                        processing={hasLease || localProcessing}
                      />
                    </p>
                  ) : null}
                </div>
                {canRemove ? (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={!removable}
                    onClick={() => setSelected(member)}
                  >
                    {t('vault.members.remove')}
                  </Button>
                ) : null}
              </article>
            </li>
          )
        })}
      </ul>

      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
      {members.isFetchingNextPage ? <SkeletonBlock height="5.5rem" /> : null}
      {members.isFetchNextPageError ? (
        <Button variant="subtle" size="sm" onClick={() => members.fetchNextPage()}>
          {t('vault.members.retryPage')}
        </Button>
      ) : null}

      <RemovalDialog
        member={selected}
        pending={removal.isPending}
        onCancel={() => setSelected(null)}
        onConfirm={confirmRemoval}
      />
    </section>
  )
}

function isProcessingPhase(phase: string): boolean {
  return phase !== 'idle' && phase !== 'paused' && phase !== 'error'
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const active = status === 'Active'
  const blocked = status === 'BlockedLastMember'
  const known = isKnownMemberStatus(status)
  return (
    <span className={`rounded-full px-2.5 py-1 text-micro font-semibold ${
      active
        ? 'bg-[rgb(var(--cv-success-rgb)/0.12)] text-[var(--cv-success)]'
        : blocked
          ? 'bg-[rgb(var(--cv-primary-rgb)/0.12)] text-[var(--cv-primary)]'
          : known
            ? 'bg-[rgb(var(--cv-pending-rgb)/0.16)] text-[var(--cv-pending)]'
            : 'bg-[rgb(var(--cv-neutral-rgb)/0.14)] text-[var(--cv-neutral)]'
    }`}>
      {known ? t(`vault.members.status.${status}`) : t('vault.members.status.unknown')}
    </span>
  )
}

function isKnownMemberStatus(status: string): boolean {
  return status === 'Active'
    || status === 'Pending'
    || status === 'WaitingForRotation'
    || status === 'BlockedLastMember'
}

function StatusDetail({
  status,
  retryRequired,
  processing,
}: {
  status: string
  retryRequired: boolean
  processing: boolean
}) {
  const { t } = useTranslation()
  if (!isKnownMemberStatus(status)) return t('vault.members.unknownDetail')
  if (status === 'BlockedLastMember') return t('vault.members.blockedDetail')
  if (retryRequired) return t('vault.members.retryRequired')
  if (processing) return t('vault.members.processing')
  return t(status === 'WaitingForRotation'
    ? 'vault.members.waitingDetail'
    : 'vault.members.pendingDetail')
}

function RemovalDialog({
  member,
  pending,
  onCancel,
  onConfirm,
}: {
  member: VaultMember | null
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  if (!member) return null
  const name = member.memberName?.trim() || shortenKey(member.memberId)
  return (
    <ModalShell
      onClose={pending ? undefined : onCancel}
      ariaLabel={t('vault.members.confirmTitle', { name })}
      title={t('vault.members.confirmTitle', { name })}
      footer={(
        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onCancel} disabled={pending} className="flex-1">
            {t('vault.cancel')}
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} disabled={pending} className="flex-[2]">
            {pending ? t('vault.members.requesting') : t('vault.members.confirm')}
          </Button>
        </DialogFooter>
      )}
    >
      <p className="text-ui text-[var(--cv-t2)]">{t('vault.members.confirmText')}</p>
    </ModalShell>
  )
}

function MembersSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-[0.625rem]">
      {[0, 1, 2].map((item) => <SkeletonBlock key={item} height="5.5rem" />)}
    </div>
  )
}
