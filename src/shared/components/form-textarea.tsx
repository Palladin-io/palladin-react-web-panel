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
}

const DEFAULT_BORDER_CLASS = 'border-[rgba(253,249,228,0.1)] focus:border-[#2EC4B6]'
const ERROR_BORDER_CLASS = 'border-[#FF4F4F] focus:border-[#FF4F4F]'

export function FormTextarea({
  label,
  id,
  labelClassName,
  borderClass,
  hasError,
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
          'mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#B8C5D4]'
        }
      >
        {label}
      </label>
      <textarea
        id={id}
        className={`w-full resize-none rounded-lg border bg-[rgba(253,249,228,0.04)] px-3 py-2
          font-mono text-sm text-[#FDF9E4] placeholder:text-[#6B7A8E] focus:outline-none ${resolvedBorder}`}
        {...props}
      />
    </div>
  )
}
