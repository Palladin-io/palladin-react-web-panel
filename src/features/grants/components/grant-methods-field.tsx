import { useTranslation } from 'react-i18next'
import {
  GRANT_METHODS,
  GRANT_METHOD_DESC_KEY,
  GRANT_METHOD_GET,
  GRANT_METHOD_LABEL_KEY,
  type GrantMethod,
} from '../grant-methods'

export interface GrantMethodsFieldProps {
  idPrefix: string
  /** Currently selected methods. */
  value: GrantMethod[]
  /** Methods the agent requested — highlighted so the approver sees what was asked for. */
  requested?: GrantMethod[]
  disabled?: boolean
  error?: string | null
  onChange: (methods: GrantMethod[]) => void
}

/**
 * Checkbox group choosing which methods a grant permits (CVT-148/149). At least one must be
 * selected. `get` carries an explicit warning because it exposes the plaintext to the agent's
 * context (and, for a hosted LLM, off the machine).
 */
export function GrantMethodsField({
  idPrefix,
  value,
  requested,
  disabled,
  error,
  onChange,
}: GrantMethodsFieldProps) {
  const { t } = useTranslation()

  function toggle(method: GrantMethod) {
    onChange(value.includes(method) ? value.filter((m) => m !== method) : [...value, method])
  }

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="text-[12px] font-semibold text-[var(--cv-t1)]">
        {t('grants.methods.legend')}
      </legend>
      <p className="text-[11px] leading-relaxed text-[var(--cv-t2)]">
        {t('grants.methods.help')}
      </p>

      <div className="flex flex-col gap-2">
        {GRANT_METHODS.map((method) => {
          const checked = value.includes(method)
          const wasRequested = requested?.includes(method)
          const id = `${idPrefix}-method-${method}`
          return (
            <label
              key={method}
              htmlFor={id}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--cv-input-border)] p-2.5 transition-colors hover:border-[var(--cv-t1)]"
            >
              <input
                id={id}
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(method)}
                className="mt-0.5"
              />
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--cv-t1)]">
                  {t(GRANT_METHOD_LABEL_KEY[method])}
                  {wasRequested && (
                    <span className="rounded-[4px] bg-[var(--cv-accent-soft,#2EC4B622)] px-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--cv-t2)]">
                      {t('grants.methods.requested')}
                    </span>
                  )}
                </span>
                <span className="text-[11px] leading-snug text-[var(--cv-t2)]">
                  {t(GRANT_METHOD_DESC_KEY[method])}
                  {method === GRANT_METHOD_GET && (
                    <span className="text-[#D4820A] dark:text-[#F0C040]">
                      {' '}
                      {t('grants.methods.getWarning')}
                    </span>
                  )}
                </span>
              </span>
            </label>
          )
        })}
      </div>

      {error && <p className="text-[11px] text-[#FF4F4F]">{t(error)}</p>}
    </fieldset>
  )
}
