import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { ModalShell } from '../../../shared/components/modal-shell'
import type { OrgGrant } from '../api/org-grants-api'
import {
  DEFAULT_GRANT_POLICY_KIND,
  grantPolicyToBody,
  POLICY_ERROR_KEY,
  validateGrantPolicy,
  type GrantPolicyBody,
  type GrantPolicyKind,
} from '../grant-policy'
import { GrantPolicyFields } from './grant-policy-fields'

export interface GrantAgainDialogProps {
  grant: OrgGrant
  isPending: boolean
  /** Confirm with the resolved policy (time → expiresAt, uses → queryLimit, lifetime → {}). */
  onConfirm: (policy: GrantPolicyBody) => void
  onCancel: () => void
}

/**
 * "Grant again" dialog for a terminal grant — re-issues access to the same
 * agent/entry. Same access-type dropdown (Time / Uses / Lifetime) and
 * validation as the approve dialog; the parent hook performs the zero-knowledge
 * envelope production.
 */
export function GrantAgainDialog({
  grant,
  isPending,
  onConfirm,
  onCancel,
}: GrantAgainDialogProps) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<GrantPolicyKind>(DEFAULT_GRANT_POLICY_KIND)
  const [expiresAt, setExpiresAt] = useState('')
  const [queryLimit, setQueryLimit] = useState('')
  const [error, setError] = useState<string | null>(null)

  const entryLabel = grant.entryLabel ?? t('grants.approve.fallbackEntry')
  const agentName = grant.agentName ?? t('grants.approve.fallbackAgent')

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
      ariaLabel={t('grants.regrant.title')}
      width={440}
    >
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-[15px] font-bold text-[var(--cv-t1)]">
            {t('grants.regrant.title')}
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--cv-t2)]">
            {t('grants.regrant.subtitlePrefix')}{' '}
            <span className="font-semibold text-[var(--cv-t1)]">{agentName}</span>{' '}
            {t('grants.regrant.subtitleAccessTo')}{' '}
            <span className="font-semibold text-[var(--cv-t1)]">{entryLabel}</span>.
          </p>
        </div>

        <GrantPolicyFields
          idPrefix="regrant"
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
            variant="accent"
            size="sm"
            onClick={handleConfirm}
            disabled={isPending}
            className="flex-[2]"
          >
            {isPending ? t('grants.regrant.granting') : t('grants.regrant.confirm')}
          </Button>
        </DialogFooter>
      </div>
    </ModalShell>
  )
}
