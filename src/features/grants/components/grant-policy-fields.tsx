import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DateTimePicker } from '../../../shared/components/datetime-picker'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { Icon } from '../../../shared/components/icon'
import { WarningZone } from '../../../shared/components/warning-zone'
import { POLICY_ERROR_KEY, type GrantPolicyKind } from '../grant-policy'
import { formatExpiresInLong, formatGrantDate } from './grant-format'

/** Quick-pick intervals offered for a time-limited grant (minutes). */
const QUICK_MINUTES = [5, 15, 30] as const
/** Quick-pick intervals offered for a time-limited grant (hours). */
const QUICK_HOURS = [1, 2, 6, 12, 24] as const
const DEFAULT_EXPIRY_HOURS = 24

/** `datetime-local` value (local timezone, minute precision) for `now + minutes`. */
function datetimeLocalInMinutes(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60_000)
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

const CHIP_CLASS =
  'rounded-md border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)] ' +
  'px-2 py-1 text-[11px] font-medium text-[var(--cv-t2)] ' +
  'transition-colors hover:border-[var(--cv-primary)] hover:text-[var(--cv-t1)] ' +
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
 *
 * Time mode offers quick-interval chips plus a Custom chip that opens the
 * on-brand `DateTimePicker` popover (the native datetime popup can't be styled).
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
  const [pickerOpen, setPickerOpen] = useState(false)
  const customButtonRef = useRef<HTMLButtonElement>(null)
  const expiryError =
    error === POLICY_ERROR_KEY.expiryRequired || error === POLICY_ERROR_KEY.expiryInPast
  const limitError =
    error === POLICY_ERROR_KEY.limitRequired || error === POLICY_ERROR_KEY.limitInvalid

  // Default to 1 day when entering time mode (or on open) so the field starts
  // filled. Keyed on `kind` only — clearing the field later must NOT auto-refill,
  // so an emptied expiry can still fail validation.
  useEffect(() => {
    if (kind === 'time' && !expiresAt) {
      onExpiresAtChange(datetimeLocalInMinutes(DEFAULT_EXPIRY_HOURS * 60))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

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
          <span className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]">
            {t('grants.approve.expiresAtLabel')}
          </span>
          {/* Quick durations — even 4-col grid (2 rows). Custom is qualitatively
              different (opens a picker), so it sits on its own full-width row. */}
          <div className="grid grid-cols-4 gap-1.5">
            {QUICK_MINUTES.map((m) => (
              <button
                key={`m${m}`}
                type="button"
                disabled={disabled}
                onClick={() => onExpiresAtChange(datetimeLocalInMinutes(m))}
                className={`${CHIP_CLASS} text-center`}
              >
                {t('grants.approve.quickMinutes', { count: m })}
              </button>
            ))}
            {QUICK_HOURS.map((h) => (
              <button
                key={`h${h}`}
                type="button"
                disabled={disabled}
                onClick={() => onExpiresAtChange(datetimeLocalInMinutes(h * 60))}
                className={`${CHIP_CLASS} text-center`}
              >
                {t('grants.approve.quickHours', { count: h })}
              </button>
            ))}
          </div>
          <button
            ref={customButtonRef}
            type="button"
            disabled={disabled}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((open) => !open)}
            className={`${CHIP_CLASS} mt-1.5 flex w-full items-center justify-center gap-1`}
          >
            <Icon name="event" size={14} />
            {t('grants.approve.quickCustom')}
          </button>

          {/* Chosen expiry — prominent relative distance (teal) on the left, the
              absolute timestamp muted on the right so the picked value is clear. */}
          {expiresAt && (
            <div
              className="mt-2 flex items-center justify-between gap-2 rounded-lg
                border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)] px-3 py-2"
            >
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--cv-t1)]">
                <Icon name="schedule" size={14} className="text-[#2EC4B6]" />
                {formatExpiresInLong(expiresAt, t)}
              </span>
              <span className="shrink-0 text-[11px] text-[var(--cv-t3)]">
                {formatGrantDate(expiresAt)}
              </span>
            </div>
          )}

          {pickerOpen && (
            <DateTimePicker
              value={expiresAt}
              anchorRef={customButtonRef}
              onChange={onExpiresAtChange}
              onClose={() => setPickerOpen(false)}
            />
          )}

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
