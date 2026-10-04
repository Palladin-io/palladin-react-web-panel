import { useEffect, useRef, useState, type ReactNode } from 'react'
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
import { Icon } from '../../../shared/components/icon'
import { useInfiniteScroll } from '../../../shared/hooks/use-infinite-scroll'
import { listEntryShares, revokeEntryShare, type EntryShareListItem, type ShareProtection } from './sharing-api'
import { ChangeShareProtectionDialog } from './change-share-protection-dialog'
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
  const [revoking, setRevoking] = useState<EntryShareListItem | null>(null)
  const [editingProtection, setEditingProtection] = useState<EntryShareListItem | null>(null)
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
    <ScrollArea>
      {shares.isPending ? <SkeletonBlock className="h-32" /> : shares.isError && !shares.data ?
        <ErrorState message={t('sharing.listError')} onRetry={() => { void shares.refetch() }} /> :
        items.length === 0 ? <EmptyState title={t('sharing.empty')} description={t('sharing.emptyDescription')} /> :
          <div className="w-full overflow-hidden rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]">
            <table className="w-full table-fixed border-collapse text-left text-meta">
              <thead className="hidden border-b border-[var(--cv-divider)] bg-[var(--cv-bg-subtle)] text-[var(--cv-t3)] md:table-header-group">
                <tr>
                  <th scope="col" className="w-[27%] px-4 py-3 font-medium">{t('sharing.recipient')}</th>
                  <th scope="col" className="w-[12%] px-3 py-3 font-medium">{t('sharing.statusLabel')}</th>
                  <th scope="col" className="w-[17%] px-3 py-3 font-medium">{t('sharing.validUntil')}</th>
                  <th scope="col" className="w-[13%] px-3 py-3 font-medium">{t('sharing.receipts')}</th>
                  <th scope="col" className="w-[12%] px-3 py-3 font-medium">{t('sharing.additionalProtection')}</th>
                  <th scope="col" className="w-[19%] px-3 py-3 text-right font-medium">{t('sharing.actions')}</th>
                </tr>
              </thead>
              <tbody>{items.map((item) => <ShareRow key={item.shareId} item={item} onRevoke={() => setRevoking(item)}
                onChangeProtection={() => setEditingProtection(item)} />)}</tbody>
            </table>
          </div>}
      <div ref={sentinel} />
      {shares.isFetchingNextPage ? <SkeletonBlock className="mt-3 h-12" /> : null}
      {shares.isFetchNextPageError ? <Button size="sm" variant="subtle" onClick={() => { void shares.fetchNextPage() }}>{t('sharing.retry')}</Button> : null}
    </ScrollArea>
    {revoking ? <ModalShell title={t('sharing.revoke')} ariaLabel={t('sharing.revoke')} trapFocus onClose={revoke.isPending ? undefined : () => setRevoking(null)}
      footer={<DialogFooter>
        <Button size="sm" variant="subtle" className="flex-1" onClick={() => setRevoking(null)} disabled={revoke.isPending}>{t('sharing.cancel')}</Button>
        <Button size="sm" variant="danger" className="flex-[2]" disabled={revoke.isPending} onClick={() => revoke.mutate(revoking.shareId)}>{t('sharing.revoke')}</Button>
      </DialogFooter>}>
      <p className="text-ui text-[var(--cv-t2)]">{t('sharing.revokeNotice')}</p>
    </ModalShell> : null}
    {editingProtection ? <ChangeShareProtectionDialog scope={scope} shareId={editingProtection.shareId}
      protection={editingProtection.protection as ShareProtection} isCurrent={sessionIsCurrent}
      onClose={() => setEditingProtection(null)} onChanged={() => { setEditingProtection(null); invalidate() }} /> : null}
  </section>
}

function ShareRow({ item, onRevoke, onChangeProtection }: { item: EntryShareListItem; onRevoke: () => void; onChangeProtection: () => void }) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const knownStatus = ['active', 'revoked', 'expired', 'suspended', 'locked', 'consumed'].includes(item.status)
  const statusTone = item.status === 'active'
    ? 'bg-[rgb(var(--cv-success-rgb)/0.12)] text-[var(--cv-success)]'
    : item.status === 'revoked' || item.status === 'locked'
      ? 'bg-[rgb(var(--cv-primary-rgb)/0.12)] text-[var(--cv-primary)]'
      : 'bg-[var(--cv-bg-subtle)] text-[var(--cv-t2)]'
  const protection = ['none', 'password', 'pin'].includes(item.protection) ? t(`sharing.${item.protection}`) : t('sharing.unknown')
  const date = (value: string | null) => {
    if (!value) return '—'
    const parsed = new Date(value)
    return Number.isFinite(parsed.valueOf()) ? parsed.toLocaleString(i18n.language) : '—'
  }
  const detail = (label: string, value: string) => <div className="min-w-0"><dt className="text-[var(--cv-t3)]">{label}</dt><dd className="mt-0.5 break-words text-[var(--cv-t1)]">{value}</dd></div>
  const cell = (label: string, content: ReactNode, className = '') => <td className={`block px-4 py-1.5 md:table-cell md:px-3 md:py-3 ${className}`}>
    <span className="mr-2 text-micro text-[var(--cv-t3)] md:hidden">{label}</span>{content}
  </td>
  return <>
    <tr className="block border-b border-[var(--cv-divider)] py-2 align-middle last:border-b-0 md:table-row md:py-0">
      <td className="block min-w-0 px-4 py-1.5 md:table-cell md:py-3">
        <span className="block truncate font-semibold text-[var(--cv-t1)]" title={item.recipientEmail ?? undefined}>
          {item.recipientMode === 'namedRecipient' ? item.recipientEmail ?? shortenKey(item.shareId) :
            item.recipientMode === 'anyoneWithLink' ? t('sharing.anyoneWithLink') : shortenKey(item.shareId)}
        </span>
        {item.sourceChanged ? <span className="text-micro text-[var(--cv-t3)]">{t('sharing.sourceChangedTitle')}. {t('sharing.sourceChanged')}</span> : null}
      </td>
      {cell(t('sharing.statusLabel'), <span className={`${METADATA_BADGE_CLASSES} ${statusTone}`}>
        {t(knownStatus ? `sharing.status.${item.status}` : 'sharing.unknown')}
      </span>)}
      {cell(t('sharing.validUntil'), date(item.expiresAt), 'text-[var(--cv-t2)]')}
      {cell(t('sharing.receipts'), `${item.deliveryCount} / ${item.maximumReceipts ?? t('sharing.unlimited')}`, 'font-medium text-[var(--cv-t1)]')}
      {cell(t('sharing.additionalProtection'), protection, 'text-[var(--cv-t2)]')}
      <td className="block px-3 py-1.5 md:table-cell md:py-3">
        <div className="flex flex-wrap items-center gap-1 md:justify-end">
          <Button size="sm" variant="ghost" className="w-action shrink-0 !px-0" aria-expanded={expanded} aria-label={t('sharing.receiptDetails')}
            onClick={() => setExpanded(!expanded)}><Icon name={expanded ? 'expand_less' : 'expand_more'} size={17} /></Button>
          {item.status === 'active' && ['none', 'password', 'pin'].includes(item.protection) ?
            <Button size="sm" variant="ghost" className="w-action shrink-0 !px-0" aria-label={t('sharing.changeProtection')} onClick={onChangeProtection}>
              <Icon name="shield" size={16} /></Button> : null}
          {['active', 'locked', 'suspended', 'consumed'].includes(item.status) ?
            <Button size="sm" variant="danger" className="w-action shrink-0 !px-0" aria-label={t('sharing.revoke')} onClick={onRevoke}>
              <Icon name="block" size={16} /></Button> : null}
        </div>
      </td>
    </tr>
    {expanded ? <tr className="block border-b border-[var(--cv-divider)] bg-[var(--cv-bg-subtle)] md:table-row">
      <td colSpan={6} className="block px-4 py-3 md:table-cell">
        <dl className="grid grid-cols-1 gap-3 text-meta sm:grid-cols-3">
          {detail(t('sharing.firstDelivery'), date(item.firstDeliveredAt))}
          {detail(t('sharing.lastDelivery'), date(item.lastDeliveredAt))}
          {detail(t('sharing.firstConfirmation'), date(item.firstConfirmedAt))}
        </dl>
      </td>
    </tr> : null}
  </>
}
