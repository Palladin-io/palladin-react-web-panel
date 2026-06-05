import { useTranslation } from 'react-i18next'
import { ErrorState } from '../../shared/components/error-state'
import { useWideScreen } from '../../shared/hooks/use-wide-screen'
import { GrantDetail, GrantDetailEmpty } from './components/grant-detail'
import { GrantListPanel } from './components/grant-list-panel'
import { useGrant } from './use-grant'

export interface GrantsPageProps {
  vaultId: string
  /** Selected grant from the route param; undefined on the bare grants route. */
  grantId?: string
}

/**
 * Vault Grants management screen — a master/detail split view. The left panel
 * lists the vault's grants with a status filter; the right panel shows the
 * selected grant's detail with the revoke action.
 *
 * On narrow screens the columns collapse: the list route shows the list, the
 * grant route shows the detail.
 */
export function GrantsPage({ vaultId, grantId }: GrantsPageProps) {
  const isWide = useWideScreen(1280)
  const detailContent = <GrantDetailContent vaultId={vaultId} grantId={grantId} />

  if (isWide) {
    return (
      <div className="flex h-full text-[var(--cv-t1)]">
        <div className="w-[clamp(300px,22vw,400px)] shrink-0 overflow-y-auto border-r border-[var(--cv-border)]">
          <div className="px-4 py-4">
            <GrantListPanel vaultId={vaultId} selectedGrantId={grantId} />
          </div>
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="px-4 py-4">{detailContent}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full text-[var(--cv-t1)]">
      <div className="px-4 py-4">
        {grantId ? (
          detailContent
        ) : (
          <GrantListPanel vaultId={vaultId} selectedGrantId={grantId} />
        )}
      </div>
    </div>
  )
}

function GrantDetailContent({
  vaultId,
  grantId,
}: {
  vaultId: string
  grantId?: string
}) {
  const { t } = useTranslation()
  // Hook order stays stable — always call useGrant, gate via `enabled`.
  const grant = useGrant(vaultId, grantId ?? '')

  if (!grantId) return <GrantDetailEmpty />
  if (grant.isPending) {
    return <div className="h-56 animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
  }
  if (grant.isError) {
    return <ErrorState message={t('grants.errorLoad')} onRetry={grant.refetch} />
  }
  if (!grant.data) {
    return (
      <div
        className="rounded-2xl border border-dashed border-[var(--cv-empty-border)]
          bg-[var(--cv-empty-bg)] p-8 text-center text-sm text-[var(--cv-t3)]"
      >
        {t('grants.notFound')}
      </div>
    )
  }
  return <GrantDetail grant={grant.data} />
}
