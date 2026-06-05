import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { ModalShell } from '../../../shared/components/modal-shell'
import type { PendingGrant } from '../api/pending-grants-api'
import {
  DEFAULT_GRANT_POLICY_KIND,
  grantPolicyToBody,
  POLICY_ERROR_KEY,
  validateGrantPolicy,
  type GrantPolicyBody,
  type GrantPolicyKind,
} from '../grant-policy'
import { GrantPolicyFields } from './grant-policy-fields'

export interface ApproveGrantDialogProps {
  grant: PendingGrant
  isPending: boolean
  /** Confirm with the resolved policy (time → expiresAt, uses → queryLimit, lifetime → {}). */
  onConfirm: (policy: GrantPolicyBody) => void
  onCancel: () => void
}

/**
 * Approval dialog for a GRANULAR pending grant. The user picks ONE access
 * policy from a dropdown — Time Limited, Number of Uses, or Lifetime — and the
 * field below adapts to the choice. The resolved policy is validated, mapped to
 * the approve body (exactly one field, or none for lifetime), and handed up;
 * the parent hook performs the zero-knowledge re-encryption.
 */
export function ApproveGrantDialog({
  grant,
  isPending,
  onConfirm,
  onCancel,
}: ApproveGrantDialogProps) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<GrantPolicyKind>(DEFAULT_GRANT_POLICY_KIND)
  const [expiresAt, setExpiresAt] = useState('')
  const [queryLimit, setQueryLimit] = useState('')
  const [error, setError] = useState<string | null>(null)

  const entryLabel = grant.entryLabel ?? t('grants.approve.fallbackEntry')
  const agentName = grant.agentName ?? t('grants.approve.fallbackAgent')
  const vaultName = grant.vaultName ?? t('grants.approve.fallbackVault')

  function handleConfirm() {
    const input = { kind, expiresAt, queryLimit }
    const validationError = validateGrantPolicy(input)
    if (validationError) {
      setError(POLICY_ERROR_KEY[validationError])
      return
    }
    onConfirm(grantPolicyToBody(input))
  }

  return (
    <ModalShell
      onClose={isPending ? undefined : onCancel}
      ariaLabel={t('grants.approve.title')}
      width={440}
    >
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-[15px] font-bold text-[var(--cv-t1)]">
            {t('grants.approve.title')}
          </h2>
          {/* "Grant {agent} access to {entry} in {vault}." — agent + vault are
              emphasised; entry shows its actual name, not "this credential". */}
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--cv-t2)]">
            {t('grants.approve.subtitlePrefix')}{' '}
            <span className="font-semibold text-[var(--cv-t1)]">{agentName}</span>{' '}
            {t('grants.approve.subtitleAccessTo')}{' '}
            <span className="font-semibold text-[var(--cv-t1)]">{entryLabel}</span>{' '}
            {t('grants.approve.subtitleIn')}{' '}
            <span className="font-semibold text-[var(--cv-t1)]">{vaultName}</span>.
          </p>
        </div>

        <GrantPolicyFields
          idPrefix="approve"
          kind={kind}
          expiresAt={expiresAt}
          queryLimit={queryLimit}
          error={error}
          disabled={isPending}
          onKindChange={(k) => {
            setKind(k)
            setError(null)
          }}
          onExpiresAtChange={(v) => {
            setExpiresAt(v)
            setError(null)
          }}
          onQueryLimitChange={(v) => {
            setQueryLimit(v)
            setError(null)
          }}
        />

        <DialogFooter>
          <Button
            variant="subtle"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
            className="flex-1"
          >
            {t('grants.cancel')}
          </Button>
          <Button
            variant="positive"
            size="sm"
            onClick={handleConfirm}
            disabled={isPending}
            className="flex-[2]"
          >
            {isPending ? t('grants.approve.approving') : t('grants.approve.approve')}
          </Button>
        </DialogFooter>
      </div>
    </ModalShell>
  )
}
