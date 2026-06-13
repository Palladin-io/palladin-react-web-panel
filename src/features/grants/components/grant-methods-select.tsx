import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import {
  GRANT_METHODS,
  GRANT_METHOD_DESC_KEY,
  GRANT_METHOD_GET,
  GRANT_METHOD_LABEL_KEY,
  type GrantMethod,
} from '../grant-methods'

export interface GrantMethodsSelectProps {
  idPrefix: string
  value: GrantMethod[]
  /** Methods the agent requested — flagged in the list so the approver sees what was asked for. */
  requested?: GrantMethod[]
  disabled?: boolean
  error?: string | null
  onChange: (methods: GrantMethod[]) => void
}

/**
 * Compact multi-select dropdown for grant methods (CVT-148/149). Replaces the tall checkbox stack:
 * the trigger shows a one-line summary of the chosen methods and the options live in a popup, so the
 * dialog stays small no matter how many methods exist. Styled like `EntityCombobox` / the access-type
 * select to match the app. The `get` warning is surfaced compactly — only when `get` is selected.
 */
export function GrantMethodsSelect({
  idPrefix,
  value,
  requested,
  disabled,
  error,
  onChange,
}: GrantMethodsSelectProps) {
  const { t } = useTranslation()
  const listId = useId()
  const [open, setOpen] = useState(false)

  function toggle(method: GrantMethod) {
    onChange(value.includes(method) ? value.filter((m) => m !== method) : [...value, method])
  }

  // Canonically-ordered summary, e.g. "Exec, Inject". Empty → placeholder.
  const summary = GRANT_METHODS.filter((m) => value.includes(m))
    .map((m) => t(GRANT_METHOD_LABEL_KEY[m]))
    .join(', ')

  return (
    <div>
      <label
        htmlFor={`${idPrefix}-methods`}
        className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
      >
        {t('grants.methods.legend')}
      </label>

      <div className="relative">
        <button
          id={`${idPrefix}-methods`}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          className="flex w-full items-center justify-between rounded-lg border border-[var(--cv-input-border)]
            bg-[var(--cv-input-bg)] px-3 py-2 pr-9 text-left text-[12px]
            focus:border-[var(--cv-t1)] focus:outline-none transition-colors
            disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className={summary ? 'text-[var(--cv-input-text)]' : 'text-[var(--cv-input-placeholder)]'}>
            {summary || t('grants.methods.placeholder')}
          </span>
        </button>
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          <Icon name="expand_more" size={16} color="var(--cv-t3)" />
        </div>

        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto
              rounded-lg border border-[var(--cv-border)] bg-[var(--cv-modal-bg)] py-1
              shadow-[0_4px_20px_rgba(0,0,0,0.15)]"
          >
            {GRANT_METHODS.map((method) => {
              const checked = value.includes(method)
              const wasRequested = requested?.includes(method)
              return (
                <li key={method} role="option" aria-selected={checked}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      // Keep focus on the trigger so the popup stays open for multi-select.
                      e.preventDefault()
                      toggle(method)
                    }}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left
                      transition-colors hover:bg-[var(--cv-list-item-hover)]"
                  >
                    <span className="mt-0.5 w-4 shrink-0">
                      {checked && <Icon name="check" size={16} color="var(--cv-t1)" />}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--cv-t1)]">
                        {t(GRANT_METHOD_LABEL_KEY[method])}
                        {wasRequested && (
                          <span className="rounded-[4px] border border-[var(--cv-input-border)] px-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--cv-t3)]">
                            {t('grants.methods.requested')}
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] leading-snug text-[var(--cv-t3)]">
                        {t(GRANT_METHOD_DESC_KEY[method])}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Compact, conditional warning — only when the plaintext method is chosen. */}
      {value.includes(GRANT_METHOD_GET) && (
        <p className="mt-1 text-[11px] leading-snug text-[#D4820A] dark:text-[#F0C040]">
          {t('grants.methods.getWarning')}
        </p>
      )}
      {error && <p className="mt-1 text-[11px] text-[#FF4F4F]">{t(error)}</p>}
    </div>
  )
}
