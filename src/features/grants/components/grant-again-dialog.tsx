import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { ModalShell } from '../../../shared/components/modal-shell'
import { GRANT_TYPE_FULL, GRANT_TYPE_SCRIPT_EXECUTION, type OrgGrant } from '../api/org-grants-api'
import {
  DEFAULT_GRANT_POLICY_KIND,
  grantPolicyToBody,
  POLICY_ERROR_KEY,
  validateGrantPolicy,
  type GrantPolicyBody,
  type GrantPolicyKind,
} from '../grant-policy'
import { GrantPolicyFields } from './grant-policy-fields'
import { ScriptGrantSummary } from './script-grant-summary'

export interface GrantAgainDialogProps {
  grant: OrgGrant
  isPending: boolean
  /** Confirm with the resolved policy (time → expiresAt, uses → queryLimit, lifetime → {}). */
  onConfirm: (policy: GrantPolicyBody, reviewedScriptRevision?: string) => void
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
  const [reviewedScriptRevision, setReviewedScriptRevision] = useState<string | null>(null)

  const isFull = grant.type === GRANT_TYPE_FULL
  const targetLabel = isFull
    ? grant.vaultName ?? t('grants.unknownTarget')
    : grant.entryLabel ?? t('grants.approve.fallbackEntry')
  const agentName = grant.agentName ?? t('grants.approve.fallbackAgent')
  const scriptEntryId = grant.scriptEntryId ?? grant.entryId
    ?? grant.scriptScopes?.find((scope) => scope.isScript)?.entryId
  const isScript = grant.type === GRANT_TYPE_SCRIPT_EXECUTION

  function handleConfirm() {
    if (isScript && !reviewedScriptRevision) return
    const input = { kind, expiresAt, queryLimit }
    const validationError = validateGrantPolicy(input)
    if (validationError) {
      setError(POLICY_ERROR_KEY[validationError])
      return
    }
    onConfirm(grantPolicyToBody(input), reviewedScriptRevision ?? undefined)
  }

  return (
    <ModalShell
      onClose={isPending ? undefined : onCancel}
      ariaLabel={t('grants.regrant.title')}
      title={t('grants.regrant.title')}
      width={440}
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onCancel} disabled={isPending} className="flex-1">
            {t('grants.cancel')}
          </Button>
          <Button variant="accent" size="sm" onClick={handleConfirm}
            disabled={isPending || (isScript && !reviewedScriptRevision)} className="flex-[2]">
            {isPending ? t('grants.regrant.granting') : t('grants.regrant.confirm')}
          </Button>
        </DialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-ui leading-relaxed text-[var(--cv-t2)]">
          {t('grants.regrant.subtitlePrefix')}{' '}
          <span className="font-semibold text-[var(--cv-t1)]">{agentName}</span>{' '}
          {t(isFull
            ? 'grants.regrant.subtitleAccessToVault'
            : 'grants.regrant.subtitleAccessTo')}{' '}
          <span className="font-semibold text-[var(--cv-t1)]">{targetLabel}</span>.
        </p>

        {isScript && scriptEntryId ? (
          <ScriptGrantSummary vaultId={grant.vaultId} scriptEntryId={scriptEntryId}
            onStatusChange={setReviewedScriptRevision} />
        ) : null}

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

      </div>
    </ModalShell>
  )
}
