import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { ModalShell } from '../../../shared/components/modal-shell'
import type { PendingGrant } from '../api/pending-grants-api'
import {
  grantPolicyToBody,
  validateGrantPolicy,
  type GrantPolicyKind,
} from '../grant-policy'

export interface ApproveGrantDialogProps {
  grant: PendingGrant
  isPending: boolean
  /** Confirm with the resolved XOR policy. */
  onConfirm: (policy: { expiresAt: string } | { queryLimit: number }) => void
  onCancel: () => void
}

const POLICY_ERROR_KEY: Record<string, string> = {
  expiryRequired: 'grants.approve.errorExpiryRequired',
  expiryInPast: 'grants.approve.errorExpiryInPast',
  limitRequired: 'grants.approve.errorLimitRequired',
  limitInvalid: 'grants.approve.errorLimitInvalid',
}

/**
 * Approval dialog for a GRANULAR pending grant. The user picks EXACTLY ONE
 * access policy — an expiry datetime (TTL) OR a usage limit (XOR). The selected
 * policy is validated, mapped to the approve body, and handed up; the parent
 * hook performs the zero-knowledge re-encryption.
 */
export function ApproveGrantDialog({
  grant,
  isPending,
  onConfirm,
  onCancel,
}: ApproveGrantDialogProps) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<GrantPolicyKind>('expiry')
  const [expiresAt, setExpiresAt] = useState('')
  const [queryLimit, setQueryLimit] = useState('')
  const [error, setError] = useState<string | null>(null)

  const entryLabel = grant.entryLabel ?? t('grants.unknownTarget')

  function handleConfirm() {
    const input = { kind, expiresAt, queryLimit }
    const validationError = validateGrantPolicy(input)
    if (validationError) {
      setError(POLICY_ERROR_KEY[validationError])
      return
    }
    onConfirm(grantPolicyToBody(input))
  }

  function selectKind(next: GrantPolicyKind) {
    setKind(next)
    setError(null)
  }

  return (
    <ModalShell
      onClose={isPending ? undefined : onCancel}
      ariaLabel={t('grants.approve.title', { name: entryLabel })}
      width={440}
    >
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-[15px] font-bold text-[var(--cv-t1)]">
            {t('grants.approve.title', { name: entryLabel })}
          </h2>
          <p className="mt-1 text-[12px] text-[var(--cv-t2)]">
            {t('grants.approve.subtitle', {
              agent: grant.agentName ?? t('grants.unknownAgent'),
            })}
          </p>
        </div>

        {/* Policy kind selector — exactly one applies (XOR). */}
        <div role="radiogroup" className="flex flex-col gap-2">
          <PolicyOption
            selected={kind === 'expiry'}
            label={t('grants.approve.policyExpiry')}
            onSelect={() => selectKind('expiry')}
          />
          {kind === 'expiry' && (
            <div className="-mb-4 pl-6">
              <FormInput
                id="approve-expires-at"
                type="datetime-local"
                label={t('grants.approve.expiresAtLabel')}
                value={expiresAt}
                disabled={isPending}
                error={error === POLICY_ERROR_KEY.expiryRequired || error === POLICY_ERROR_KEY.expiryInPast}
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

          <PolicyOption
            selected={kind === 'limit'}
            label={t('grants.approve.policyLimit')}
            onSelect={() => selectKind('limit')}
          />
          {kind === 'limit' && (
            <div className="-mb-4 pl-6">
              <FormInput
                id="approve-query-limit"
                type="number"
                min={1}
                label={t('grants.approve.queryLimitLabel')}
                placeholder={t('grants.approve.queryLimitPlaceholder')}
                value={queryLimit}
                disabled={isPending}
                error={error === POLICY_ERROR_KEY.limitRequired || error === POLICY_ERROR_KEY.limitInvalid}
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
        </div>

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

function PolicyOption({
  selected,
  label,
  onSelect,
}: {
  selected: boolean
  label: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="flex items-center gap-2 text-left text-[12px] text-[var(--cv-t1)]"
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          selected ? 'border-[#2EC4B6]' : 'border-[var(--cv-input-border)]'
        }`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-[#2EC4B6]" />}
      </span>
      {label}
    </button>
  )
}
