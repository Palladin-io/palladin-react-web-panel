import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { ErrorState } from '../../../shared/components/error-state'
import { openMemberSecret } from '../../../shared/crypto/entry-protocol'
import { fromMemberSecret, type EntryDraft, type MemberSecretView } from '../../../shared/crypto/entry-draft'
import { openMemberVaultKey } from '../../../shared/crypto/vault-protocol'
import { wipe } from '../../../shared/crypto/sodium'
import { shortenKey } from '../../../shared/lib/shorten-key'
import { useAuthStore } from '../../auth'
import type { CanonicalEntryDetail, EntryHistoryItem } from '../api/vault-api'
import { getEncryptedVault } from '../sync/member-sync-api'
import { useEntryHistory } from '../use-entries'
import { useUpdateCanonicalEntry } from '../use-update-canonical-entry'

export interface EntryHistoryTabProps {
  detail: CanonicalEntryDetail
}

function asDraft(secret: MemberSecretView): EntryDraft {
  return {
    memberLabel: secret.memberLabel,
    agentLabel: secret.agentLabel,
    ...(secret.description ? { description: secret.description } : {}),
    ...(secret.iconReference ? { iconReference: secret.iconReference } : {}),
    entryType: secret.entryType,
    content: secret.content,
    policy: secret.agentVisibilityPolicy,
  }
}

export function EntryHistoryTab({ detail }: EntryHistoryTabProps) {
  const { t, i18n } = useTranslation()
  const history = useEntryHistory(detail.vaultId, detail.id, true)
  const update = useUpdateCanonicalEntry(detail.vaultId, detail.id)
  const [selected, setSelected] = useState<{ revision: string; value: MemberSecretView } | null>(null)
  const [revealingRevision, setRevealingRevision] = useState<string | null>(null)

  useEffect(() => useAuthStore.subscribe((state, previous) => {
    if (previous.privateKey && !state.privateKey) setSelected(null)
  }), [])

  const items = useMemo(() => history.data?.pages.flatMap((page) => page.items) ?? [], [history.data])

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

  const reveal = async (item: EntryHistoryItem) => {
    setSelected(null)
    setRevealingRevision(item.revision)
    try {
      const value = await withVaultKey(async (vaultKey) => fromMemberSecret(await openMemberSecret(
        item.entryKey, item.memberSecret, vaultKey, {
          organizationId: detail.organizationId, vaultId: detail.vaultId,
          entryId: detail.id, revision: item.revision,
        },
      )))
      setSelected({ revision: item.revision, value })
    } catch {
      toast.error(t('vault.entry.history.decryptError'))
    } finally {
      setRevealingRevision(null)
    }
  }

  const restore = async () => {
    if (!selected || selected.revision === detail.currentRevision) return
    try {
      const current = await withVaultKey(async (vaultKey) => fromMemberSecret(await openMemberSecret(
        detail.entryKey, detail.memberSecret, vaultKey, {
          organizationId: detail.organizationId, vaultId: detail.vaultId,
          entryId: detail.id, revision: detail.currentRevision,
        },
      )))
      await update.mutateAsync({ detail, previous: current, draft: asDraft(selected.value) })
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
      <p className="text-body text-[var(--cv-t3)]">{t('vault.entry.history.description')}</p>
      {items.map((item) => {
        const isCurrent = item.revision === detail.currentRevision
        const isSelected = selected?.revision === item.revision
        return (
          <article key={item.revision} className="rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-ui font-semibold">{t('vault.entry.history.revision', { revision: item.revision })}</span>
                  {isCurrent ? <span className="text-meta text-[var(--cv-success)]">{t('vault.entry.history.current')}</span> : null}
                </div>
                <p className="text-meta text-[var(--cv-t3)]">
                  {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.changedAt))}
                  {' · '}{t(`vault.entry.history.operation.${item.operation}`)}
                  {' · '}{t(`vault.entry.history.actor.${item.changedByType}`, { id: shortenKey(item.changedById) })}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => isSelected ? setSelected(null) : reveal(item)}
                disabled={revealingRevision !== null}
              >
                {revealingRevision === item.revision
                  ? t('vault.entry.history.decrypting')
                  : isSelected ? t('vault.entry.history.hide') : t('vault.entry.history.reveal')}
              </Button>
            </div>
            {isSelected ? (
              <div className="mt-3 rounded-lg bg-[var(--cv-surface-subtle)] p-3">
                <p className="text-ui font-semibold">{selected.value.memberLabel}</p>
                {selected.value.description ? <p className="mt-1 text-body text-[var(--cv-t2)]">{selected.value.description}</p> : null}
                {!isCurrent ? (
                  <Button className="mt-3" variant="accent" size="sm" icon="restore" onClick={restore} disabled={update.isPending}>
                    {update.isPending ? t('vault.entry.history.restoring') : t('vault.entry.history.restore')}
                  </Button>
                ) : null}
              </div>
            ) : null}
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
