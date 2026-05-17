import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { Icon } from '../../../shared/components/icon'
import { analytics } from '../../../shared/lib/analytics'
import type { ApiKeySummary } from '../api/api-keys-api'
import { useRevokeApiKey } from '../use-revoke-api-key'
import { ApiKeyStatusBadge } from './api-key-list-panel'
import { RevokeApiKeyDialog } from './revoke-api-key-dialog'

export interface ApiKeyDetailProps {
  apiKey: ApiKeySummary
}

/**
 * Formats an ISO timestamp as a locale-aware date-time. The detail panel
 * shows full timestamps (unlike the day-level list rows) so the operator
 * can audit exactly when a key was created or revoked.
 */
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

/**
 * Right-side detail content for the "Details" tab: the key's name,
 * status, lifecycle timestamps and — for an active key — the revoke
 * action. Revoking is gated behind a confirmation dialog because it is
 * irreversible and instantly cuts off any agent using the key.
 */
export function ApiKeyDetail({ apiKey }: ApiKeyDetailProps) {
  const { t } = useTranslation()
  const revoke = useRevokeApiKey()

  const [revokeOpen, setRevokeOpen] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const isActive = apiKey.status === 'active'

  const handleConfirmRevoke = () => {
    setRevokeError(null)
    revoke.mutate(apiKey.apiKeyId, {
      onSuccess: () => {
        analytics.capture('apiKeys', 'api-key-revoked')
        setRevokeOpen(false)
      },
      onError: () => {
        setRevokeOpen(false)
        setRevokeError(t('apiKeys.errorRevoke'))
      },
    })
  }

  return (
    <>
      <div
        className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5
          dark:shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-[16px] font-bold text-[var(--cv-t1)]">
              {apiKey.name}
            </h2>
            <div className="mt-1.5">
              <ApiKeyStatusBadge status={apiKey.status} />
            </div>
          </div>
        </div>

        <dl className="mt-5 flex flex-col gap-3 border-t border-[var(--cv-divider)] pt-4">
          <DetailRow
            label={t('apiKeys.detail.key')}
            value={`cv_••••${apiKey.keySuffix}`}
            mono
          />
          <DetailRow
            label={t('apiKeys.detail.createdAt')}
            value={formatDateTime(apiKey.createdAt)}
          />
          {apiKey.revokedAt ? (
            <DetailRow
              label={t('apiKeys.detail.revokedAt')}
              value={formatDateTime(apiKey.revokedAt)}
            />
          ) : null}
        </dl>
      </div>

      {isActive ? (
        <section
          className="mt-4 rounded-xl border border-[rgba(255,79,79,0.25)] bg-[rgba(255,79,79,0.04)] p-4"
        >
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#FF4F4F]">
            {t('apiKeys.dangerZone')}
          </h2>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[12px] font-semibold text-[var(--cv-t1)]">
                {t('apiKeys.revokeTitle')}
              </div>
              <p className="mt-0.5 text-[11px] text-[var(--cv-t3)]">
                {t('apiKeys.revokeSubtitle')}
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setRevokeError(null)
                setRevokeOpen(true)
              }}
              disabled={revoke.isPending}
            >
              {t('apiKeys.revoke')}
            </Button>
          </div>
          {revokeError ? (
            <p className="mt-2 text-[11px] text-[#FF4F4F]" role="alert">
              {revokeError}
            </p>
          ) : null}
        </section>
      ) : null}

      <RevokeApiKeyDialog
        open={revokeOpen}
        keyName={apiKey.name}
        isPending={revoke.isPending}
        onConfirm={handleConfirmRevoke}
        onCancel={() => setRevokeOpen(false)}
      />
    </>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[12px] text-[var(--cv-t3)]">{label}</dt>
      <dd className={`text-[12px] font-medium text-[var(--cv-t1)]${mono ? ' font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

/** Empty-state shown in the right panel when no key is selected (wide mode). */
export function ApiKeyDetailEmpty() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-center">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full
          bg-[var(--cv-empty-bg)]"
      >
        <Icon name="key" size={26} color="var(--cv-t3)" />
      </span>
      <p className="text-[13px] text-[var(--cv-t3)]">
        {t('apiKeys.detail.noSelection')}
      </p>
    </div>
  )
}
