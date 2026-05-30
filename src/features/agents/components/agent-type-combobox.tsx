import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import { agentTypeLabelKey } from './agent-presentation'

export function typeLabel(value: string, t: (key: string) => string): string {
  const key = agentTypeLabelKey(value)
  return key ? t(key) : value
}

interface AgentTypeComboboxProps {
  typeValues: string[]
  inputValue: string
  onInputChange: (text: string) => void
  onSelect: (value: string, label: string) => void
  disabled?: boolean
}

export function AgentTypeCombobox({
  typeValues,
  inputValue,
  onInputChange,
  onSelect,
  disabled,
}: AgentTypeComboboxProps) {
  const { t } = useTranslation()
  const listId = useId()
  const [open, setOpen] = useState(false)

  const filtered = inputValue.trim()
    ? typeValues.filter((v) =>
        typeLabel(v, t).toLowerCase().includes(inputValue.toLowerCase()),
      )
    : typeValues

  return (
    <div>
      <label
        htmlFor="agent-type-combobox"
        className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
      >
        {t('agents.agentType')}
      </label>
      <div className="relative">
        <input
          id="agent-type-combobox"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          value={inputValue}
          onChange={(e) => {
            onInputChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder={t('agents.typePlaceholder')}
          disabled={disabled}
          autoComplete="off"
          className="w-full rounded-lg border border-[var(--cv-input-border)]
            bg-[var(--cv-input-bg)] px-3 py-2 pr-9 text-[12px] text-[var(--cv-input-text)]
            placeholder:text-[var(--cv-input-placeholder)]
            focus:border-[var(--cv-t1)] focus:outline-none transition-colors
            disabled:cursor-not-allowed disabled:opacity-40"
        />
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          <Icon name="expand_more" size={16} color="var(--cv-t3)" />
        </div>

        {open && filtered.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto
              rounded-lg border border-[var(--cv-border)] bg-[var(--cv-modal-bg)] py-1
              shadow-[0_4px_20px_rgba(0,0,0,0.15)]"
          >
            {filtered.map((value) => (
              <li key={value} role="option" aria-selected={false}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onSelect(value, typeLabel(value, t))
                    setOpen(false)
                  }}
                  className="w-full px-3 py-2 text-left text-[12px] text-[var(--cv-t1)]
                    transition-colors hover:bg-[var(--cv-list-item-hover)]"
                >
                  {typeLabel(value, t)}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
