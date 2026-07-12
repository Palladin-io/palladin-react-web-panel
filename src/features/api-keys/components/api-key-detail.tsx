import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { Icon } from '../../../shared/components/icon'
import { analytics } from '../../../shared/lib/analytics'
import type { ApiKeySummary } from '../api/api-keys-api'
import { useApiKeyPermissions } from '../use-api-keys'
import { useActivateApiKey } from '../use-activate-api-key'
import { useDeleteApiKey } from '../use-delete-api-key'
import { useRevokeApiKey } from '../use-revoke-api-key'
import { ApiKeyStatusBadge } from './api-key-list-panel'
import { ModalShell } from '../../../shared/components/modal-shell'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { RevokeApiKeyDialog } from './revoke-api-key-dialog'

export interface ApiKeyDetailProps {
  apiKey: ApiKeySummary
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ApiKeyDetail({ apiKey }: ApiKeyDetailProps) {
  const { t } = useTranslation()
  const { canWrite } = useApiKeyPermissions()
  const revoke = useRevokeApiKey()
  const activate = useActivateApiKey()
  const del = useDeleteApiKey()

  const [revokeOpen, setRevokeOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const isActive = apiKey.status === 'active'

  const handleConfirmRevoke = () => {
    revoke.mutate(apiKey.apiKeyId, {
      onSuccess: () => {
        analytics.capture('apiKeys', 'api-key-revoked')
        setRevokeOpen(false)
      },
      onError: () => {
        setRevokeOpen(false)
        toast.error(t('apiKeys.errorRevoke'))
      },
    })
  }

  const handleActivate = () => {
    activate.mutate(apiKey.apiKeyId, {
      onSuccess: () => {
        analytics.capture('apiKeys', 'api-key-activated')
      },
      onError: () => {
        toast.error(t('apiKeys.errorActivate'))
      },
    })
  }

  const handleConfirmDelete = () => {
    del.mutate(apiKey.apiKeyId, {
      onSuccess: () => {
        analytics.capture('apiKeys', 'api-key-deleted')
        setDeleteOpen(false)
      },
      onError: () => {
        setDeleteOpen(false)
        toast.error(t('apiKeys.errorDelete'))
      },
    })
  }

  return (
    <>
      {/* Main info card */}
      <div
        className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5
          dark:shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
      >
        <div className="flex items-center justify-between gap-3 min-w-0">
          <h2 className="truncate text-heading font-bold text-[var(--cv-t1)]">
            {apiKey.name}
          </h2>
          <div className="shrink-0">
            <ApiKeyStatusBadge status={apiKey.status} />
          </div>
        </div>

        <dl className="mt-5 flex flex-col gap-3 border-t border-[var(--cv-divider)] pt-4">
          <DetailRow
            label={t('apiKeys.detail.key')}
            value={`pl_••••${apiKey.keySuffix || '••••'}`}
            mono
          />
          <DetailRow
            label={t('apiKeys.detail.createdAt')}
            value={`${formatDateTime(apiKey.createdAt)}${apiKey.createdByName ? ` · ${apiKey.createdByName}` : ''}`}
          />
          {apiKey.revokedAt ? (
            <DetailRow
              label={t('apiKeys.detail.revokedAt')}
              value={`${formatDateTime(apiKey.revokedAt)}${apiKey.revokedByName ? ` · ${apiKey.revokedByName}` : ''}`}
            />
          ) : null}
        </dl>
      </div>

      {/* Activate zone — shown only for revoked keys when user has write permission */}
      {!isActive && canWrite ? (
        <section
          className="mt-4 rounded-xl border border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.12)] p-4"
        >
          <h2 className="text-meta font-semibold uppercase tracking-[0.06em] text-[#10B981]">
            {t('apiKeys.activateZone')}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-meta text-[var(--cv-t3)]">
              {t('apiKeys.activateSubtitle')}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleActivate}
              disabled={activate.isPending}
            >
              {activate.isPending ? t('apiKeys.activating') : t('apiKeys.activate')}
            </Button>
          </div>
        </section>
      ) : null}

      {/* Danger zone — shown only when user has write permission */}
      {canWrite ? <section
        className="mt-4 rounded-xl border border-[rgb(var(--cv-primary-rgb)/0.25)] bg-[rgb(var(--cv-primary-rgb)/0.04)] p-4"
      >
        <h2 className="text-meta font-semibold uppercase tracking-[0.06em] text-[var(--cv-primary)]">
          {t('apiKeys.dangerZone')}
        </h2>

        {isActive ? (
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-meta text-[var(--cv-t3)]">
              {t('apiKeys.revokeSubtitle')}
            </p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setRevokeOpen(true)}
              disabled={revoke.isPending}
            >
              {t('apiKeys.revoke')}
            </Button>
          </div>
        ) : (
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-meta text-[var(--cv-t3)]">
              {t('apiKeys.deleteSubtitle')}
            </p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              disabled={del.isPending}
            >
              {t('apiKeys.delete')}
            </Button>
          </div>
        )}

      </section> : null}

      <RevokeApiKeyDialog
        open={revokeOpen}
        keyName={apiKey.name}
        isPending={revoke.isPending}
        onConfirm={handleConfirmRevoke}
        onCancel={() => setRevokeOpen(false)}
      />

      <DeleteApiKeyDialog
        open={deleteOpen}
        keyName={apiKey.name}
        isPending={del.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-ui text-[var(--cv-t3)]">{label}</dt>
      <dd className={`text-right text-ui font-medium text-[var(--cv-t1)]${mono ? ' font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

/** Empty-state shown in the right panel when no key is selected (wide mode). */
export function ApiKeyDetailEmpty() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full min-h-[17.5rem] flex-col items-center justify-center gap-3 text-center">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full
          bg-[var(--cv-empty-bg)]"
      >
        <Icon name="key" size={26} color="var(--cv-t3)" />
      </span>
      <p className="text-heading-sm text-[var(--cv-t3)]">
        {t('apiKeys.detail.noSelection')}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

interface DeleteApiKeyDialogProps {
  open: boolean
  keyName: string
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}

function DeleteApiKeyDialog({
  open,
  keyName,
  isPending,
  onConfirm,
  onCancel,
}: DeleteApiKeyDialogProps) {
  const { t } = useTranslation()
  if (!open) return null
  return (
    <ModalShell
      onClose={isPending ? undefined : onCancel}
      ariaLabel={t('apiKeys.deleteConfirmTitle', { name: keyName })}
      title={t('apiKeys.deleteConfirmTitle', { name: keyName })}
      width={420}
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onCancel} disabled={isPending} className="flex-1">
            {t('apiKeys.cancel')}
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} disabled={isPending} className="flex-[2]">
            {t('apiKeys.confirmDelete')}
          </Button>
        </DialogFooter>
      }
    >
      <p className="text-ui text-[var(--cv-t2)]">
        {t('apiKeys.deleteConfirmText')}
      </p>
    </ModalShell>
  )
}
