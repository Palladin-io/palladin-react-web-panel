import { useTranslation } from 'react-i18next'
import { Icon } from './icon'

export interface SecretInputProps {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  shown: boolean
  onToggleShown: () => void
  placeholder?: string
  disabled?: boolean
  monospace?: boolean
  required?: boolean
  autoComplete?: string
}

export function SecretInput({
  id, label, value, onChange, shown, onToggleShown,
  placeholder, disabled, monospace, required, autoComplete = 'new-password',
}: SecretInputProps) {
  const { t } = useTranslation()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete={autoComplete}
          className={`w-full rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)]
            py-2 pl-3 pr-10 text-[12px] text-[var(--cv-input-text)]
            placeholder:text-[var(--cv-input-placeholder)]
            focus:border-[var(--cv-t1)] focus:outline-none disabled:opacity-60${monospace ? ' font-mono' : ''}`}
        />
        <button
          type="button"
          onClick={onToggleShown}
          aria-label={shown ? t('vault.entry.hide') : t('vault.entry.reveal')}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7
            items-center justify-center rounded text-[var(--cv-t3)] hover:text-[var(--cv-t1)] transition-colors"
        >
          <Icon name={shown ? 'visibility_off' : 'visibility'} size={15} />
        </button>
      </div>
    </div>
  )
}
