import type { TextareaHTMLAttributes } from 'react'

/**
 * Textarea counterpart to {@link FormInput} — same label chrome and the
 * same border/focus tokens, just wrapping a multi-line input. Use this
 * instead of raw `<textarea>` so recovery/import/paste flows inherit the
 * form look without duplicating Tailwind strings.
 */
export interface FormTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  label: string
  /** Override the default label className when different styling is needed. */
  labelClassName?: string
  /** Override border + focus-border classes. Defaults to subtle/teal. */
  borderClass?: string
  /** Render the error-coloured border (red) when true. */
  hasError?: boolean
  /** Render the textarea with a monospace font (for keys/codes). */
  monospace?: boolean
}

const DEFAULT_BORDER_CLASS = 'border-[var(--cv-input-border)] focus:border-[var(--cv-t1)]'
const ERROR_BORDER_CLASS = 'border-[var(--cv-primary)] focus:border-[var(--cv-primary)]'

export function FormTextarea({
  label,
  id,
  labelClassName,
  borderClass,
  hasError,
  monospace = false,
  ...props
}: FormTextareaProps) {
  const resolvedBorder =
    borderClass ?? (hasError ? ERROR_BORDER_CLASS : DEFAULT_BORDER_CLASS)

  return (
    <div>
      <label
        htmlFor={id}
        className={
          labelClassName ??
          'mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]'
        }
      >
        {label}
      </label>
      <textarea
        id={id}
        className={`w-full resize-none rounded-lg border bg-[var(--cv-input-bg)] px-3 py-2
          text-[12px] text-[var(--cv-input-text)] placeholder:text-[var(--cv-input-placeholder)] focus:outline-none ${resolvedBorder}${monospace ? ' font-mono' : ''}`}
        {...props}
      />
    </div>
  )
}
