import { useTranslation } from 'react-i18next'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { Icon } from '../../../shared/components/icon'
import { POLICY_ERROR_KEY, type GrantPolicyKind } from '../grant-policy'

const POLICY_KINDS: { value: GrantPolicyKind; labelKey: string }[] = [
  { value: 'time', labelKey: 'grants.approve.policyTime' },
  { value: 'uses', labelKey: 'grants.approve.policyUses' },
  { value: 'lifetime', labelKey: 'grants.approve.policyLifetime' },
]

// appearance-none + pr-9 + a custom chevron so the dropdown arrow sits exactly
// where the combobox chevron does (right-3), instead of the native select arrow.
const SELECT_CLASS =
  'w-full appearance-none rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)] ' +
  'px-3 py-2 pr-9 text-[12px] text-[var(--cv-input-text)] ' +
  'focus:border-[var(--cv-t1)] focus:outline-none transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-40'

export interface GrantPolicyFieldsProps {
  kind: GrantPolicyKind
  expiresAt: string
  queryLimit: string
  error: string | null
  disabled: boolean
  onKindChange: (kind: GrantPolicyKind) => void
  onExpiresAtChange: (value: string) => void
  onQueryLimitChange: (value: string) => void
  /** Prefix for input ids so multiple instances don't collide. */
  idPrefix: string
}

/**
 * Shared access-policy segment — the access-type dropdown (Time / Uses /
 * Lifetime) plus the dependent field. Reused by every grant dialog (approve,
 * grant-again, proactive grant) so the policy UX + validation stay identical.
 * Validation/mapping live in `grant-policy.ts`.
 */
export function GrantPolicyFields({
  kind,
  expiresAt,
  queryLimit,
  error,
  disabled,
  onKindChange,
  onExpiresAtChange,
  onQueryLimitChange,
  idPrefix,
}: GrantPolicyFieldsProps) {
  const { t } = useTranslation()
  const expiryError =
    error === POLICY_ERROR_KEY.expiryRequired || error === POLICY_ERROR_KEY.expiryInPast
  const limitError =
    error === POLICY_ERROR_KEY.limitRequired || error === POLICY_ERROR_KEY.limitInvalid

  return (
    <>
      <div>
        <label
          htmlFor={`${idPrefix}-policy-kind`}
          className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
        >
          {t('grants.approve.accessTypeLabel')}
        </label>
        <div className="relative">
          <select
            id={`${idPrefix}-policy-kind`}
            value={kind}
            disabled={disabled}
            onChange={(e) => onKindChange(e.target.value as GrantPolicyKind)}
            className={SELECT_CLASS}
          >
            {POLICY_KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <Icon name="expand_more" size={16} color="var(--cv-t3)" />
          </div>
        </div>
      </div>

      {kind === 'time' && (
        <div className="-mb-4">
          <FormInput
            id={`${idPrefix}-expires-at`}
            type="datetime-local"
            label={t('grants.approve.expiresAtLabel')}
            value={expiresAt}
            disabled={disabled}
            error={expiryError}
            onChange={(e) => onExpiresAtChange(e.target.value)}
          />
          <FieldFeedback visible={expiryError} color="red">
            {error ? t(error) : ''}
          </FieldFeedback>
        </div>
      )}

      {kind === 'uses' && (
        <div className="-mb-4">
          <FormInput
            id={`${idPrefix}-query-limit`}
            type="number"
            min={1}
            label={t('grants.approve.queryLimitLabel')}
            placeholder={t('grants.approve.queryLimitPlaceholder')}
            value={queryLimit}
            disabled={disabled}
            error={limitError}
            onChange={(e) => onQueryLimitChange(e.target.value)}
          />
          <FieldFeedback visible={limitError} color="red">
            {error ? t(error) : ''}
          </FieldFeedback>
        </div>
      )}

      {kind === 'lifetime' && (
        <p className="rounded-lg bg-[var(--cv-bg-subtle)] px-3 py-2 text-[11px] text-[var(--cv-t3)]">
          {t('grants.approve.lifetimeHint')}
        </p>
      )}
    </>
  )
}
