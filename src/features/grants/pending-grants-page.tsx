import { useAuthStore } from '../auth'
import { useWideScreen } from '../../shared/hooks/use-wide-screen'
import { PERMISSION_GRANT_MANAGE } from '../../shared/lib/permissions'
import { OrgGrantsPanel } from './components/org-grants-panel'
import { PendingGrantsPanel } from './components/pending-grants-panel'
import { usePendingGrants } from './use-pending-grants'

/**
 * Approvals screen at `/approvals` — left-aligned split view matching the
 * Agents/Vaults layout pattern (never centred).
 *
 * - Left: pending approvals queue (agent request → approve/deny). Approve runs
 *   the zero-knowledge re-encryption inside the panel.
 * - Right: org-wide grants of every status, with search/filter, grouping, a
 *   summary counter, and per-row actions (Revoke / Grant again). Gated on
 *   GrantManage so a 403 is never requested.
 *
 * On narrow screens the two panels stack vertically (pending first).
 *
 * When the queue is empty we hide the Pending column entirely so the history
 * panel takes the full width (and its grid spreads into more columns). The
 * queue stays visible while loading/erroring — and always for users without
 * GrantManage, who have no history panel to fill the space — so the page is
 * never blank.
 */
export function PendingGrantsPage() {
  const isWide = useWideScreen()
  const permissions = useAuthStore((s) => s.permissions)
  const canManageGrants = (permissions & PERMISSION_GRANT_MANAGE) !== 0

  const pending = usePendingGrants()
  const hasPending = (pending.data?.length ?? 0) > 0
  const showPending =
    !canManageGrants || pending.isPending || pending.isError || hasPending

  if (isWide) {
    return (
      <div className="flex h-full text-[var(--cv-t1)]">
        {showPending && (
          <div className="w-[clamp(18.75rem,22vw,25rem)] shrink-0 overflow-y-auto border-r border-[var(--cv-border)]">
            <div className="px-4 py-4">
              <PendingGrantsPanel />
            </div>
          </div>
        )}
        {canManageGrants && (
          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="px-4 py-4">
              <OrgGrantsPanel />
            </div>
          </div>
        )}
      </div>
    )
  }

  // Narrow: single column — pending queue first (when shown), org grants below.
  return (
    <div className="min-h-full text-[var(--cv-t1)]">
      <div className="px-4 py-4">
        {showPending && <PendingGrantsPanel />}
        {canManageGrants && (
          <div className={showPending ? 'mt-8' : ''}>
            <OrgGrantsPanel />
          </div>
        )}
      </div>
    </div>
  )
}
