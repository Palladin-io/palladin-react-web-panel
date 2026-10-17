import { useTranslation } from 'react-i18next'
import { CopyButton } from './copy-button'
import { Icon } from './icon'
import { PasswordGeneratorPopover } from './password-generator-popover'

export interface SecretInputProps {
  id: string
  label: string
  /** Override the label className — pass `sr-only` for compact single-line rows. */
  labelClassName?: string
  value: string
  onChange: (next: string) => void
  shown: boolean
  onToggleShown: () => void
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  monospace?: boolean
  autoComplete?: string
  /** Show a red border to signal a validation error. */
  error?: boolean
  /** Override border + focus-border classes for a semantic read-only state. */
  borderClass?: string
  onBlur?: () => void
  /** Render a copy-to-clipboard button that copies the value without revealing it. */
  copyable?: boolean
  /** Accessible label for the copy button (e.g. "Copy password"). */
  copyLabel?: string
  copyFeedback?: boolean
  clearCopiedSecret?: boolean
  /** Optional third inline action, beside Copy and Reveal. */
  trailingAction?: { icon: string; label: string; onClick: () => void }
  /** Read-only presentation separates actions from the value, without inset controls. */
  appearance?: 'input' | 'display'
  /**
   * Render a password-generator affordance. Receives the generated value — the
   * caller both stores it and reveals the field so the user sees what they got.
   */
  onGenerate?: (password: string) => void
}

const PADDING_FOR_ACTION_COUNT: Record<number, string> = {
  1: ' pr-10', 2: ' pr-16', 3: ' pr-[6.5rem]',
}

export function SecretInput({
  id, label, labelClassName, value, onChange, shown, onToggleShown,
  placeholder, disabled, readOnly, monospace, autoComplete = 'off', error, onBlur,
  borderClass, copyable, copyLabel, copyFeedback, clearCopiedSecret = true, trailingAction, onGenerate, appearance = 'input',
}: SecretInputProps) {
  const { t } = useTranslation()
  const actionCount = 1 + (copyable ? 1 : 0) + (onGenerate ? 1 : 0) + (trailingAction ? 1 : 0)
  const display = appearance === 'display' && readOnly
  const paddingRight = display ? '' : PADDING_FOR_ACTION_COUNT[actionCount] ?? ' pr-10'
  return (
    <div>
      <label
        htmlFor={id}
        className={labelClassName ?? 'mb-1.5 block text-meta font-semibold text-[var(--cv-label-text)]'}
      >
        {label}
      </label>
      <div className={display ? 'flex min-w-0 items-center gap-2' : 'relative'}>
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
          readOnly={readOnly}
          autoComplete={autoComplete}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          data-form-type="other"
          // `ph-no-capture`: never let PostHog autocapture or a session
          // recording read this secret value (defense in depth over the
          // masking configured in analytics.init).
          className={`ph-no-capture h-control w-full min-w-0 rounded-lg border
            ${display ? 'bg-transparent px-0 text-right border-transparent focus-visible:border-[var(--cv-input-border)]' : 'bg-[var(--cv-input-bg)] pl-3'} text-ui text-[var(--cv-input-text)]
            placeholder:text-[var(--cv-input-placeholder)]
            focus:outline-none transition-colors duration-200 disabled:opacity-60${monospace ? ' font-mono' : ''}
            ${paddingRight}
            ${!shown && value ? ' secret-mask' : ''}
            ${display ? '' : borderClass ?? (error
              ? 'border-[var(--cv-primary)] focus:border-[var(--cv-primary)]'
              : 'border-[var(--cv-input-border)] focus:border-[var(--cv-t1)]'
            )}`}
        />
        <div className={display ? 'flex shrink-0 items-center gap-0.5' : 'absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5'}>
          {onGenerate ? <PasswordGeneratorPopover onUse={onGenerate} disabled={disabled} /> : null}
          {copyable ? <CopyButton value={value} label={copyLabel} secret={clearCopiedSecret} feedback={copyFeedback} /> : null}
          <button
            type="button"
            onClick={onToggleShown}
            aria-label={shown ? t('vault.entry.hide') : t('vault.entry.reveal')}
            className="inline-flex h-action w-action items-center justify-center rounded
              text-[var(--cv-t3)] hover:text-[var(--cv-t1)] transition-colors"
          >
            <Icon name={shown ? 'visibility_off' : 'visibility'} size={16} />
          </button>
          {trailingAction ? <button type="button" onClick={trailingAction.onClick} aria-label={trailingAction.label}
            title={trailingAction.label} className="inline-flex h-action w-action items-center justify-center rounded
              text-[var(--cv-t3)] hover:text-[var(--cv-t1)] transition-colors">
            <Icon name={trailingAction.icon} size={16} />
          </button> : null}
        </div>
      </div>
    </div>
  )
}
