import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import { openMemberSecret } from '../../../shared/crypto/entry-protocol'
import { fromMemberSecret, type EntryDraft, type MemberSecretView } from '../../../shared/crypto/entry-draft'
import { openMemberVaultKey } from '../../../shared/crypto/vault-protocol'
import type { MemberSecretV1 } from '../../../shared/crypto/vault-plaintext'
import { wipe } from '../../../shared/crypto/sodium'
import { useOrganizationMemberDirectory } from '../../../shared/hooks/use-organization-member-directory'
import { organizationIdFromAccessToken } from '../../../shared/lib/organization-scope'
import { shortenKey } from '../../../shared/lib/shorten-key'
import { useAuthStore } from '../../auth'
import type { CanonicalEntryDetail, EntryHistoryItem } from '../api/vault-api'
import { getEncryptedVault } from '../sync/member-sync-api'
import { useEntryHistory } from '../use-entries'
import { useUpdateCanonicalEntry } from '../use-update-canonical-entry'
import { HistoricalEntryForm } from './historical-entry-form'

export interface EntryHistoryTabProps {
  detail: CanonicalEntryDetail
}

function asDraft(secret: MemberSecretView): EntryDraft {
  return {
    memberLabel: secret.memberLabel,
    agentLabel: secret.agentLabel,
    ...(secret.description ? { description: secret.description } : {}),
    ...(secret.iconReference ? { iconReference: secret.iconReference } : {}),
    ...(secret.color ? { color: secret.color } : {}),
    entryType: secret.entryType,
    content: secret.content,
    policy: secret.agentVisibilityPolicy,
  }
}

export function EntryHistoryTab({ detail }: EntryHistoryTabProps) {
  const scopeKey = `${detail.organizationId}:${detail.vaultId}:${detail.id}:${detail.currentRevision}`
  return <ScopedEntryHistoryTab key={scopeKey} detail={detail} />
}

function ScopedEntryHistoryTab({ detail }: EntryHistoryTabProps) {
  const { t, i18n } = useTranslation()
  const history = useEntryHistory(detail.vaultId, detail.id, true)
  const update = useUpdateCanonicalEntry(detail.vaultId, detail.id)
  const [selected, setSelected] = useState<{
    revision: string
    canonicalSecret: MemberSecretV1
    previousView?: MemberSecretView
    cryptoSessionGeneration: number
  } | null>(null)
  const [revealingRevision, setRevealingRevision] = useState<string | null>(null)
  const selectedView = useMemo(
    () => selected ? fromMemberSecret(selected.canonicalSecret) : null,
    [selected],
  )

  useEffect(() => useAuthStore.subscribe((state, previous) => {
    if (previous.privateKey !== state.privateKey
      || previous.cryptoSessionGeneration !== state.cryptoSessionGeneration) setSelected(null)
  }), [])

  const items = useMemo(() => history.data?.pages.flatMap((page) => page.items) ?? [], [history.data])
  const accessToken = useAuthStore((state) => state.accessToken)
  const memberIds = useMemo(
    () => items
      .filter((item) => item.changedByType === 1)
      .map((item) => item.changedById),
    [items],
  )
  const memberDirectory = useOrganizationMemberDirectory(
    organizationIdFromAccessToken(accessToken),
    memberIds,
  )

  const actorLabel = (item: EntryHistoryItem): string => {
    if (item.changedByType === 1) {
      return t('vault.entry.history.actor.1', {
        name: memberDirectory.nameById[item.changedById] ?? shortenKey(item.changedById),
      })
    }
    if (item.changedByType === 2) {
      return t('vault.entry.history.actor.2', { name: shortenKey(item.changedById) })
    }
    return t('vault.entry.history.actor.3')
  }

  const withVaultKey = async <T,>(run: (vaultKey: Uint8Array) => Promise<T>): Promise<T> => {
    const key = useAuthStore.getState().privateKey
    if (!key) throw new Error('Vault is locked')
    const vault = await getEncryptedVault(detail.vaultId)
    const vaultKey = await openMemberVaultKey(vault.memberVaultKey, key)
    try {
      const result = await run(vaultKey)
      if (useAuthStore.getState().privateKey !== key) throw new Error('Vault lock session changed')
      return result
    } finally {
      wipe(vaultKey)
    }
  }

  const previousItemFor = async (item: EntryHistoryItem): Promise<EntryHistoryItem | undefined> => {
    const loadedIndex = items.findIndex((candidate) => candidate.revision === item.revision)
    if (loadedIndex >= 0 && loadedIndex + 1 < items.length) return items[loadedIndex + 1]
    if (!history.hasNextPage) return undefined
    const next = await history.fetchNextPage()
    const expandedItems = next.data?.pages.flatMap((page) => page.items) ?? items
    const expandedIndex = expandedItems.findIndex((candidate) => candidate.revision === item.revision)
    return expandedIndex >= 0 ? expandedItems[expandedIndex + 1] : undefined
  }

  const reveal = async (item: EntryHistoryItem) => {
    setSelected(null)
    setRevealingRevision(item.revision)
    const cryptoSessionGeneration = useAuthStore.getState().cryptoSessionGeneration
    try {
      const previousItem = item.operation === 1 ? undefined : await previousItemFor(item)
      if (useAuthStore.getState().cryptoSessionGeneration !== cryptoSessionGeneration) {
        throw new Error('Vault lock session changed')
      }
      const revealed = await withVaultKey(async (vaultKey) => {
        const canonicalSecret = await openMemberSecret(item.entryKey, item.memberSecret, vaultKey, {
          organizationId: detail.organizationId, vaultId: detail.vaultId,
          entryId: detail.id, revision: item.revision,
        })
        if (!previousItem) return { canonicalSecret }
        if (useAuthStore.getState().cryptoSessionGeneration !== cryptoSessionGeneration) {
          throw new Error('Vault lock session changed')
        }
        const previousCanonicalSecret = await openMemberSecret(
          previousItem.entryKey, previousItem.memberSecret, vaultKey, {
            organizationId: detail.organizationId, vaultId: detail.vaultId,
            entryId: detail.id, revision: previousItem.revision,
          },
        )
        return { canonicalSecret, previousView: fromMemberSecret(previousCanonicalSecret) }
      })
      if (useAuthStore.getState().cryptoSessionGeneration !== cryptoSessionGeneration) {
        throw new Error('Vault lock session changed')
      }
      setSelected({ revision: item.revision, ...revealed, cryptoSessionGeneration })
    } catch {
      toast.error(t('vault.entry.history.decryptError'))
    } finally {
      setRevealingRevision(null)
    }
  }

  const restore = async () => {
    if (!selected || !selectedView || selected.revision === detail.currentRevision) return
    try {
      if (useAuthStore.getState().cryptoSessionGeneration !== selected.cryptoSessionGeneration) {
        throw new Error('Vault lock session changed')
      }
      const currentCanonicalSecret = await withVaultKey(async (vaultKey) => openMemberSecret(
        detail.entryKey, detail.memberSecret, vaultKey, {
          organizationId: detail.organizationId, vaultId: detail.vaultId,
          entryId: detail.id, revision: detail.currentRevision,
        },
      ))
      const current = fromMemberSecret(currentCanonicalSecret)
      await update.mutateAsync({
        detail,
        previous: current,
        draft: asDraft(selectedView),
        cryptoSessionGeneration: selected.cryptoSessionGeneration,
        previousCanonicalMemberSecret: currentCanonicalSecret,
        nextCanonicalMemberSecret: selected.canonicalSecret,
      })
      setSelected(null)
      toast.success(t('vault.entry.history.restoreSuccess'))
    } catch {
      toast.error(t('vault.entry.history.restoreError'))
    }
  }

  if (history.isPending) {
    return <div className="h-40 animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
  }
  if (history.isError) {
    return <ErrorState message={t('vault.entry.history.loadError')} onRetry={history.refetch} />
  }

  return (
    <div className="space-y-3" data-testid="entry-history-tab">
      {items.map((item) => {
        const isCurrent = item.revision === detail.currentRevision
        const isSelected = selected?.revision === item.revision
        return (
          <article
            key={item.revision}
            className="overflow-hidden rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-ui font-semibold">{t('vault.entry.history.revision', { revision: item.revision })}</span>
                  {isCurrent ? <span className="text-meta text-[var(--cv-success)]">{t('vault.entry.history.current')}</span> : null}
                </div>
              </div>
              <Button
                variant={isSelected ? 'subtle' : 'accent'}
                size="sm"
                onClick={() => isSelected ? setSelected(null) : reveal(item)}
                disabled={revealingRevision !== null}
              >
                <Icon
                  name={revealingRevision === item.revision
                    ? 'progress_activity'
                    : isSelected ? 'visibility_off' : 'visibility'}
                  size={14}
                  className={revealingRevision === item.revision ? 'animate-spin motion-reduce:animate-none' : undefined}
                />
                {revealingRevision === item.revision
                  ? t('vault.entry.history.decrypting')
                  : isSelected ? t('vault.entry.history.hide') : t('vault.entry.history.reveal')}
              </Button>
            </div>
            {isSelected ? (
              <div className="entry-history-reveal border-t border-[var(--cv-divider)] bg-[var(--cv-bg-subtle)] p-4">
                <HistoricalEntryForm
                  revision={selected.revision}
                  secret={selectedView!}
                  previousSecret={selected.previousView}
                />
                {!isCurrent ? (
                  <div className="mt-4 flex justify-end border-t border-[var(--cv-divider)] pt-4">
                    <Button variant="accent" size="sm" icon="restore" onClick={restore} disabled={update.isPending}>
                      {update.isPending ? t('vault.entry.history.restoring') : t('vault.entry.history.restore')}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <footer
              data-testid="entry-history-audit-footer"
              className="flex min-h-[2.875rem] flex-wrap items-center justify-between gap-x-4 gap-y-1
                border-t border-[var(--cv-divider)] bg-[var(--cv-card-footer)] px-4 py-2"
            >
              <div className="flex min-w-0 items-center gap-1.5 text-micro text-[var(--cv-t3)]">
                <Icon name="history" size={13} className="shrink-0" />
                <span className="truncate">
                  {t(`vault.entry.history.operation.${item.operation}`)}
                  {' · '}
                  {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.changedAt))}
                </span>
              </div>
              <span className="min-w-0 truncate text-micro text-[var(--cv-t3)]">
                {actorLabel(item)}
              </span>
            </footer>
          </article>
        )
      })}
      {items.length === 0 ? <p className="text-body text-[var(--cv-t3)]">{t('vault.entry.history.empty')}</p> : null}
      {history.hasNextPage ? (
        <Button variant="outline" size="sm" onClick={() => history.fetchNextPage()} disabled={history.isFetchingNextPage}>
          {history.isFetchingNextPage ? t('vault.entry.history.loadingMore') : t('vault.entry.history.loadMore')}
        </Button>
      ) : null}
    </div>
  )
}
