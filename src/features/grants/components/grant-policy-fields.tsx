import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { Icon } from '../../../shared/components/icon'
import { WarningZone } from '../../../shared/components/warning-zone'
import { POLICY_ERROR_KEY, type GrantPolicyKind } from '../grant-policy'

/** Quick-pick durations (hours) offered for a time-limited grant. */
const QUICK_HOURS = [1, 2, 6, 12, 24] as const
const DEFAULT_EXPIRY_HOURS = 24

/** `datetime-local` value (local timezone, minute precision) for `now + hours`. */
function datetimeLocalIn(hours: number): string {
  const d = new Date(Date.now() + hours * 3_600_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

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

  // Default to 1 day when entering time mode (or on open) so the field starts
  // filled. Keyed on `kind` only — clearing the field later must NOT auto-refill,
  // so an emptied expiry can still fail validation.
  useEffect(() => {
    if (kind === 'time' && !expiresAt) {
      onExpiresAtChange(datetimeLocalIn(DEFAULT_EXPIRY_HOURS))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])
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
            // Block past dates. (No inline color-scheme — it can stop Chrome
            // from opening the native date picker.)
            min={datetimeLocalIn(0)}
            onChange={(e) => onExpiresAtChange(e.target.value)}
          />
          {/* Quick durations — one click sets now + Nh. */}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {QUICK_HOURS.map((h) => (
              <button
                key={h}
                type="button"
                disabled={disabled}
                onClick={() => onExpiresAtChange(datetimeLocalIn(h))}
                className="rounded-md border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)]
                  px-2 py-1 text-[11px] font-medium text-[var(--cv-t2)]
                  transition-colors hover:border-[#FF4F4F] hover:text-[var(--cv-t1)]
                  disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('grants.approve.quickHours', { count: h })}
              </button>
            ))}
          </div>
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
        <WarningZone title={t('grants.methods.warningZoneTitle')}>
          {t('grants.approve.lifetimeHint')}
        </WarningZone>
      )}
    </>
  )
}
