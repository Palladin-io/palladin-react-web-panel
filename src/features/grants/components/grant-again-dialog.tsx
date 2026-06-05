import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { ModalShell } from '../../../shared/components/modal-shell'
import type { OrgGrant } from '../api/org-grants-api'
import {
  DEFAULT_GRANT_POLICY_KIND,
  grantPolicyToBody,
  validateGrantPolicy,
  type GrantPolicyBody,
  type GrantPolicyKind,
} from '../grant-policy'

export interface GrantAgainDialogProps {
  grant: OrgGrant
  isPending: boolean
  /** Confirm with the resolved policy (time → expiresAt, uses → queryLimit, lifetime → {}). */
  onConfirm: (policy: GrantPolicyBody) => void
  onCancel: () => void
}

const POLICY_ERROR_KEY: Record<string, string> = {
  expiryRequired: 'grants.approve.errorExpiryRequired',
  expiryInPast: 'grants.approve.errorExpiryInPast',
  limitRequired: 'grants.approve.errorLimitRequired',
  limitInvalid: 'grants.approve.errorLimitInvalid',
}

const POLICY_KINDS: { value: GrantPolicyKind; labelKey: string }[] = [
  { value: 'time', labelKey: 'grants.approve.policyTime' },
  { value: 'uses', labelKey: 'grants.approve.policyUses' },
  { value: 'lifetime', labelKey: 'grants.approve.policyLifetime' },
]

const SELECT_CLASS =
  'w-full rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)] ' +
  'px-3 py-2 text-[12px] text-[var(--cv-input-text)] ' +
  'focus:border-[var(--cv-t1)] focus:outline-none transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-40'

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

        <div>
          <label
            htmlFor="regrant-policy-kind"
            className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
          >
            {t('grants.approve.accessTypeLabel')}
          </label>
          <select
            id="regrant-policy-kind"
            value={kind}
            disabled={isPending}
            onChange={(e) => {
              setKind(e.target.value as GrantPolicyKind)
              setError(null)
            }}
            className={SELECT_CLASS}
          >
            {POLICY_KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {kind === 'time' && (
          <div className="-mb-4">
            <FormInput
              id="regrant-expires-at"
              type="datetime-local"
              label={t('grants.approve.expiresAtLabel')}
              value={expiresAt}
              disabled={isPending}
              error={
                error === POLICY_ERROR_KEY.expiryRequired ||
                error === POLICY_ERROR_KEY.expiryInPast
              }
              onChange={(e) => {
                setExpiresAt(e.target.value)
                setError(null)
              }}
            />
            <FieldFeedback
              visible={
                error === POLICY_ERROR_KEY.expiryRequired ||
                error === POLICY_ERROR_KEY.expiryInPast
              }
              color="red"
            >
              {error ? t(error) : ''}
            </FieldFeedback>
          </div>
        )}

        {kind === 'uses' && (
          <div className="-mb-4">
            <FormInput
              id="regrant-query-limit"
              type="number"
              min={1}
              label={t('grants.approve.queryLimitLabel')}
              placeholder={t('grants.approve.queryLimitPlaceholder')}
              value={queryLimit}
              disabled={isPending}
              error={
                error === POLICY_ERROR_KEY.limitRequired ||
                error === POLICY_ERROR_KEY.limitInvalid
              }
              onChange={(e) => {
                setQueryLimit(e.target.value)
                setError(null)
              }}
            />
            <FieldFeedback
              visible={
                error === POLICY_ERROR_KEY.limitRequired ||
                error === POLICY_ERROR_KEY.limitInvalid
              }
              color="red"
            >
              {error ? t(error) : ''}
            </FieldFeedback>
          </div>
        )}

        {kind === 'lifetime' && (
          <p className="rounded-lg bg-[var(--cv-bg-subtle)] px-3 py-2 text-[11px] text-[var(--cv-t3)]">
            {t('grants.approve.lifetimeHint')}
          </p>
        )}

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
