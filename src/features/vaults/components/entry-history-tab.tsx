import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { ErrorState } from '../../../shared/components/error-state'
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
  const scopeKey = `${detail.organizationId}:${detail.vaultId}:${detail.id}`
  return <ScopedEntryHistoryTab key={scopeKey} detail={detail} />
}

function ScopedEntryHistoryTab({ detail }: EntryHistoryTabProps) {
  const { t, i18n } = useTranslation()
  const history = useEntryHistory(detail.vaultId, detail.id, true)
  const update = useUpdateCanonicalEntry(detail.vaultId, detail.id)
  const [selected, setSelected] = useState<{
    revision: string
    canonicalSecret: MemberSecretV1
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

  const reveal = async (item: EntryHistoryItem) => {
    setSelected(null)
    setRevealingRevision(item.revision)
    const cryptoSessionGeneration = useAuthStore.getState().cryptoSessionGeneration
    try {
      const canonicalSecret = await withVaultKey(async (vaultKey) => openMemberSecret(
        item.entryKey, item.memberSecret, vaultKey, {
          organizationId: detail.organizationId, vaultId: detail.vaultId,
          entryId: detail.id, revision: item.revision,
        },
      ))
      if (useAuthStore.getState().cryptoSessionGeneration !== cryptoSessionGeneration) {
        throw new Error('Vault lock session changed')
      }
      setSelected({ revision: item.revision, canonicalSecret, cryptoSessionGeneration })
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
                  {' · '}{actorLabel(item)}
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
              <div className="mt-3 rounded-xl border border-[var(--cv-divider)] bg-[var(--cv-surface-subtle)] p-4">
                <HistoricalEntryForm
                  revision={selected.revision}
                  secret={selectedView!}
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
