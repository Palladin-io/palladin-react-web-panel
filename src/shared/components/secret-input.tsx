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
  autoComplete?: string
  /** Show a red border to signal a validation error. */
  error?: boolean
  onBlur?: () => void
}

export function SecretInput({
  id, label, value, onChange, shown, onToggleShown,
  placeholder, disabled, monospace, autoComplete = 'off', error, onBlur,
}: SecretInputProps) {
  const { t } = useTranslation()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]">
        {label}
      </label>
      <div className="relative">
        {/* Never `type=password`: a real password field in a form makes the
            browser's password manager offer to save the vault secret. We mask a
            plain text field via `.secret-mask` (a disc-glyph font that masks in
            every browser incl. Firefox, hardened by -webkit-text-security) and
            add ignore hints for third-party managers (1Password/LastPass/Bitwarden). */}
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          data-form-type="other"
          className={`w-full rounded-lg border bg-[var(--cv-input-bg)]
            py-2 pl-3 pr-10 text-[12px] text-[var(--cv-input-text)]
            placeholder:text-[var(--cv-input-placeholder)]
            focus:outline-none transition-colors duration-200 disabled:opacity-60${monospace ? ' font-mono' : ''}
            ${shown ? '' : ' secret-mask'}
            ${error
              ? 'border-[#FF4F4F] focus:border-[#FF4F4F]'
              : 'border-[var(--cv-input-border)] focus:border-[var(--cv-t1)]'
            }`}
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
