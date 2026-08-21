import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { PERMISSION_AUDIT_VIEW } from '../../../shared/lib/permissions'
import { useAuthStore } from '../../auth'
import {
  AuditLogList,
  useAuditLogPresentation,
  useOrgAuditLogs,
} from '../../audit'

/** How many of the most recent org events the dashboard surfaces. */
const RECENT_LIMIT = 10

/**
 * "Recent activity" block for the dashboard — the latest org audit events,
 * reusing the canonical `AuditLogList` row renderer and org-audit query rather
 * than a bespoke list. Capped at {@link RECENT_LIMIT}; a "Full log →" link
 * leads to the full Audit Log. Gated on AuditView — hidden entirely for viewers
 * without the permission (no teasing a log they cannot open).
 */
export function RecentActivitySection() {
  const { t } = useTranslation()
  const permissions = useAuthStore((s) => s.permissions)
  const canView = (permissions & PERMISSION_AUDIT_VIEW) !== 0

  const logs = useOrgAuditLogs({}, canView)

  const allItems = useMemo(
    () => (logs.data?.pages ?? []).flatMap((p) => p.items),
    [logs.data],
  )
  const recent = useMemo(() => allItems.slice(0, RECENT_LIMIT), [allItems])
  const presentation = useAuditLogPresentation(recent, { enabled: canView })

  if (!canView) return null

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-ui font-semibold text-[var(--cv-t1)]">
          {t('dashboard.recentActivity')}
        </span>
        <Link
          to="/audit"
          className="text-meta font-medium text-[var(--cv-primary)] hover:underline"
        >
          {t('dashboard.fullLog')}
        </Link>
      </div>

      <AuditLogList
        items={recent}
        isPending={logs.isPending}
        isError={logs.isError}
        onRetry={() => logs.refetch()}
        hasNextPage={false}
        isFetchingNextPage={false}
        onLoadMore={() => {}}
        presentation={presentation}
        showVault
        emptyMessage={t('dashboard.noActivity')}
        canView={canView}
      />
    </section>
  )
}
