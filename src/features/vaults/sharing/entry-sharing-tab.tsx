import { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuthStore } from '../../auth'
import { PERMISSION_VAULT_MANAGE } from '../../../shared/lib/permissions'
import { organizationIdFromAccessToken } from '../../../shared/lib/organization-scope'
import { shortenKey } from '../../../shared/lib/shorten-key'
import { METADATA_BADGE_CLASSES } from '../../../shared/lib/styles'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { ModalShell } from '../../../shared/components/modal-shell'
import { EmptyState } from '../../../shared/components/empty-state'
import { ErrorState } from '../../../shared/components/error-state'
import { SkeletonBlock } from '../../../shared/components/skeleton-block'
import { ScrollArea } from '../../../shared/components/scroll-area'
import { WarningZone } from '../../../shared/components/warning-zone'
import { useInfiniteScroll } from '../../../shared/hooks/use-infinite-scroll'
import { CreateEntryShareDialog } from './create-entry-share-dialog'
import { listEntryShares, revokeEntryShare, type EntryShareListItem } from './sharing-api'
import type { ShareSourceScope } from './use-share-creation'

export function EntrySharingTab({ scope }: { scope: ShareSourceScope }) {
  const { t } = useTranslation()
  const generation = useAuthStore((state) => state.cryptoSessionGeneration)
  const locked = useAuthStore((state) => state.isVaultLocked)
  const permissions = useAuthStore((state) => state.permissions)
  const userId = useAuthStore((state) => state.userId)
  const organizationId = useAuthStore((state) => organizationIdFromAccessToken(state.accessToken))
  if (locked || !userId || organizationId !== scope.organizationId || !(permissions & PERMISSION_VAULT_MANAGE)) {
    return <p className="text-meta text-[var(--cv-t3)]">{t('sharing.unavailable')}</p>
  }
  return <ScopedEntrySharingTab key={`${userId}:${scope.organizationId}:${scope.vaultId}:${scope.entryId}:${scope.revision}:${scope.keyVersion}:${generation}`} scope={scope} generation={generation} />
}

function ScopedEntrySharingTab({ scope, generation }: { scope: ShareSourceScope; generation: number }) {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.userId)
  const queryClient = useQueryClient()
  const queryKey = ['entry-sharing', userId, scope.organizationId, scope.vaultId, scope.entryId, generation]
  const shares = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) => listEntryShares(scope.vaultId, scope.entryId, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 0, gcTime: 0, refetchInterval: 30_000,
  })
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<EntryShareListItem | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller
    return () => { controller.abort(); controllerRef.current = null }
  }, [])
  const invalidate = () => { void queryClient.invalidateQueries({ queryKey }) }
  const sessionIsCurrent = () => {
    const current = useAuthStore.getState()
    return controllerRef.current?.signal.aborted === false && !current.isVaultLocked
      && current.userId === userId && current.cryptoSessionGeneration === generation
      && (current.permissions & PERMISSION_VAULT_MANAGE) !== 0
      && organizationIdFromAccessToken(current.accessToken) === scope.organizationId
  }
  const revoke = useMutation({
    gcTime: 0,
    mutationFn: (shareId: string) => {
      const controller = controllerRef.current
      if (!controller || !sessionIsCurrent()) throw new Error('Sharing session unavailable')
      return revokeEntryShare(scope.vaultId, scope.entryId, shareId, controller.signal)
    },
    onSuccess: () => {
      if (!sessionIsCurrent()) return
      setRevoking(null); invalidate(); toast.success(t('sharing.revoked'))
    },
    onError: () => { if (sessionIsCurrent()) toast.error(t('sharing.revokeError')) },
  })
  const sentinel = useRef<HTMLDivElement>(null)
  useInfiniteScroll(sentinel, { onLoadMore: shares.fetchNextPage,
    enabled: !!shares.hasNextPage && !shares.isFetchingNextPage && !shares.isFetchNextPageError })
  const items = shares.data?.pages.flatMap((page) => page.items) ?? []
  return <section className="flex min-h-0 flex-1 flex-col">
    <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
      <p className="text-meta text-[var(--cv-t3)]">{t('sharing.listNotice')}</p>
      <Button size="sm" variant="accent" icon="add" onClick={() => setCreating(true)}>{t('sharing.create')}</Button>
    </div>
    <ScrollArea>
      {shares.isPending ? <SkeletonBlock className="h-32" /> : shares.isError && !shares.data ?
        <ErrorState message={t('sharing.listError')} onRetry={() => { void shares.refetch() }} /> :
        items.length === 0 ? <EmptyState title={t('sharing.empty')} description={t('sharing.emptyDescription')} /> :
          <div className="flex flex-col gap-3">{items.map((item) => <ShareRow key={item.shareId} item={item} onRevoke={() => setRevoking(item)} />)}</div>}
      <div ref={sentinel} />
      {shares.isFetchingNextPage ? <SkeletonBlock className="mt-3 h-12" /> : null}
      {shares.isFetchNextPageError ? <Button size="sm" variant="subtle" onClick={() => { void shares.fetchNextPage() }}>{t('sharing.retry')}</Button> : null}
    </ScrollArea>
    {creating ? <CreateEntryShareDialog scope={scope} onCreated={invalidate} onClose={() => { setCreating(false); invalidate() }} /> : null}
    {revoking ? <ModalShell title={t('sharing.revoke')} ariaLabel={t('sharing.revoke')} trapFocus onClose={revoke.isPending ? undefined : () => setRevoking(null)}
      footer={<DialogFooter>
        <Button size="sm" variant="subtle" className="flex-1" onClick={() => setRevoking(null)} disabled={revoke.isPending}>{t('sharing.cancel')}</Button>
        <Button size="sm" variant="danger" className="flex-[2]" disabled={revoke.isPending} onClick={() => revoke.mutate(revoking.shareId)}>{t('sharing.revoke')}</Button>
      </DialogFooter>}>
      <p className="text-ui text-[var(--cv-t2)]">{t('sharing.revokeNotice')}</p>
    </ModalShell> : null}
  </section>
}

function ShareRow({ item, onRevoke }: { item: EntryShareListItem; onRevoke: () => void }) {
  const { t, i18n } = useTranslation()
  const knownStatus = ['active', 'revoked', 'expired', 'suspended', 'locked', 'consumed'].includes(item.status)
  const protection = ['none', 'password', 'pin'].includes(item.protection) ? t(`sharing.${item.protection}`) : t('sharing.unknown')
  const date = (value: string | null) => {
    if (!value) return '—'
    const parsed = new Date(value)
    return Number.isFinite(parsed.valueOf()) ? parsed.toLocaleString(i18n.language) : '—'
  }
  const detail = (label: string, value: string) => <div className="min-w-0"><dt className="text-[var(--cv-t3)]">{label}</dt><dd className="break-words text-[var(--cv-t1)]">{value}</dd></div>
  return <article className="rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0 break-all text-ui font-semibold text-[var(--cv-t1)]">{item.recipientMode === 'namedRecipient' ? item.recipientEmail ?? shortenKey(item.shareId) :
        item.recipientMode === 'anyoneWithLink' ? t('sharing.anyoneWithLink') : shortenKey(item.shareId)}</span>
      <span className={`${METADATA_BADGE_CLASSES} bg-[var(--cv-bg-subtle)] text-[var(--cv-t2)]`}>
        {t(knownStatus ? `sharing.status.${item.status}` : 'sharing.unknown')}
      </span>
    </div>
    <dl className="grid grid-cols-1 gap-3 text-meta sm:grid-cols-2">
      {detail(t('sharing.validUntil'), date(item.expiresAt))}
      {detail(t('sharing.receipts'), `${item.deliveryCount} / ${item.maximumReceipts}`)}
      {detail(t('sharing.firstDelivery'), date(item.firstDeliveredAt))}
      {detail(t('sharing.lastDelivery'), date(item.lastDeliveredAt))}
      {detail(t('sharing.firstConfirmation'), date(item.firstConfirmedAt))}
      {detail(t('sharing.additionalProtection'), protection)}
    </dl>
    {item.sourceChanged ? <div className="mt-3"><WarningZone title={t('sharing.sourceChangedTitle')}>{t('sharing.sourceChanged')}</WarningZone></div> : null}
    {['active', 'locked', 'suspended', 'consumed'].includes(item.status) ? <div className="mt-3 flex justify-end">
      <Button size="sm" variant="danger" onClick={onRevoke}>{t('sharing.revoke')}</Button>
    </div> : null}
  </article>
}
