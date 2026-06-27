import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { useAuthStore } from '../../auth'
import { PERMISSION_GRANT_MANAGE } from '../../../shared/lib/permissions'
import type { Grant } from '../api/grants-api'
import { grantStatusPresentation, isRevocable } from '../grant-presentation'
import { parseGrantMethods } from '../grant-methods'
import { useRevokeGrant } from '../use-revoke-grant'
import { formatGrantDate } from './grant-format'
import { GrantMethodsBadges } from './grant-methods-badges'
import { RevokeGrantDialog } from './revoke-grant-dialog'

export interface GrantDetailProps {
  grant: Grant
}

/** Single read-only field row in the detail card. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="shrink-0 text-[11px] font-semibold text-[var(--cv-t3)]">
        {label}
      </span>
      <span className="min-w-0 break-words text-right text-[12px] text-[var(--cv-t1)]">
        {value}
      </span>
    </div>
  )
}

/**
 * Read-only detail view of a single grant: status, agent, target entry,
 * mode, expiry/usage limits, and lifecycle timestamps. Surfaces the revoke
 * action when the grant is still revocable and the user holds GrantManage.
 *
 * No crypto material is present here — the management contract never returns
 * VK/DEK/blobs.
 */
export function GrantDetail({ grant }: GrantDetailProps) {
  const { t } = useTranslation()
  const permissions = useAuthStore((s) => s.permissions)
  const canManage = (permissions & PERMISSION_GRANT_MANAGE) !== 0

  const [dialogOpen, setDialogOpen] = useState(false)
  const revoke = useRevokeGrant()

  const presentation = grantStatusPresentation(grant.status)
  const target = grant.entryLabel ?? t('grants.detail.wholeVault')
  const showRevoke = canManage && isRevocable(grant.status)
  const grantMethods = parseGrantMethods(grant.methods)

  function handleConfirm(reason: string) {
    revoke.mutate(
      { vaultId: grant.vaultId, grantId: grant.grantId, reason },
      {
        onSuccess: () => {
          toast.success(t('grants.revokeSuccess'))
          setDialogOpen(false)
        },
        onError: () => toast.error(t('grants.errorRevoke')),
      },
    )
  }

  const expiryValue = grant.expiresAt
    ? formatGrantDate(grant.expiresAt)
    : grant.queryLimit != null
      ? t('grants.detail.usesValue', {
          count: grant.queryCount,
          limit: grant.queryLimit,
        })
      : t('grants.detail.noLimit')

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16px] font-bold text-[var(--cv-t1)]">
            {target}
          </h2>
          <p className="mt-0.5 text-[11px] text-[var(--cv-t3)]">
            {grant.agentName ?? t('grants.unknownAgent')}
          </p>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold"
          style={{ color: presentation.color }}
        >
          ● {t(presentation.labelKey)}
        </span>
      </div>

      {/* Detail card */}
      <div className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] px-4 py-2">
        <DetailRow
          label={t('grants.detail.mode')}
          value={t(grant.mode === 'full' ? 'grants.modeFull' : 'grants.modeGranular')}
        />
        <DetailRow
          label={t('grants.detail.agent')}
          value={grant.agentName ?? t('grants.unknownAgent')}
        />
        {grant.entryLabel && (
          <DetailRow label={t('grants.detail.entry')} value={grant.entryLabel} />
        )}
        {grantMethods.length > 0 && (
          <div className="flex items-start justify-between gap-4 py-2">
            <span className="shrink-0 text-[11px] font-semibold text-[var(--cv-t3)]">
              {t('grants.detail.methods')}
            </span>
            <GrantMethodsBadges methods={grantMethods} />
          </div>
        )}
        {grant.reason && (
          <DetailRow label={t('grants.detail.reason')} value={grant.reason} />
        )}
        <DetailRow label={t('grants.detail.limit')} value={expiryValue} />
        <DetailRow
          label={t('grants.detail.created')}
          value={`${formatGrantDate(grant.createdAt)}${
            grant.createdByName ? ` · ${grant.createdByName}` : ''
          }`}
        />
        {grant.revokedAt && (
          <DetailRow
            label={t('grants.detail.revoked')}
            value={`${formatGrantDate(grant.revokedAt)}${
              grant.revokedByName ? ` · ${grant.revokedByName}` : ''
            }`}
          />
        )}
        {grant.revokeReason && (
          <DetailRow
            label={t('grants.detail.revokeReason')}
            value={grant.revokeReason}
          />
        )}
      </div>

      {/* Revoke action */}
      {showRevoke && (
        <div
          className="rounded-2xl border border-[rgb(var(--cv-primary-rgb)/0.25)]
            bg-[rgb(var(--cv-primary-rgb)/0.04)] p-4"
        >
          <p className="text-[12px] font-semibold text-[var(--cv-t1)]">
            {t('grants.revokeZoneTitle')}
          </p>
          <p className="mt-1 text-[11px] text-[var(--cv-t3)]">
            {t('grants.revokeZoneHint')}
          </p>
          <Button
            variant="danger"
            size="sm"
            className="mt-3"
            onClick={() => setDialogOpen(true)}
            disabled={revoke.isPending}
          >
            {t('grants.revoke')}
          </Button>
        </div>
      )}

      <RevokeGrantDialog
        open={dialogOpen}
        targetLabel={target}
        isPending={revoke.isPending}
        onConfirm={handleConfirm}
        onCancel={() => setDialogOpen(false)}
      />
    </div>
  )
}

/** Empty placeholder shown when no grant is selected in the split view. */
export function GrantDetailEmpty() {
  const { t } = useTranslation()
  return (
    <div
      className="flex h-full min-h-[200px] items-center justify-center rounded-2xl
        border border-dashed border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)]
        p-8 text-center text-[12px] text-[var(--cv-t3)]"
    >
      {t('grants.selectGrant')}
    </div>
  )
}
