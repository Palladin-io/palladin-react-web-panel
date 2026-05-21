import type { InputHTMLAttributes, ReactNode } from 'react'

/**
 * Styled text input with label for onboarding and settings forms.
 *
 * Pass `borderClass` to override the border/focus-border classes when the
 * border must change dynamically (e.g. correct/wrong state on confirm step).
 * Pass `error` for a standard red-border error state without a custom borderClass.
 */
export interface FormInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string
  /** Override the default label className when different styling is needed. */
  labelClassName?: string
  /** Override border + focus-border classes. Defaults to subtle/teal. */
  borderClass?: string
  /** Render the input value in a monospace font (e.g. API keys, tokens). */
  monospace?: boolean
  /** Show a red border to signal a validation error. */
  error?: boolean
}

export function FormInput({
  label,
  id,
  labelClassName,
  borderClass,
  monospace,
  error,
  ...props
}: FormInputProps) {
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
      <input
        id={id}
        className={`w-full rounded-lg border bg-[var(--cv-input-bg)] px-3 py-2 text-[12px]
          text-[var(--cv-input-text)] placeholder:text-[var(--cv-input-placeholder)]
          focus:outline-none transition-colors duration-200 ${
          borderClass ?? (error
            ? 'border-[#FF4F4F] focus:border-[#FF4F4F]'
            : 'border-[var(--cv-input-border)] focus:border-[var(--cv-t1)]')
        }${monospace ? ' font-mono' : ''}`}
        {...props}
      />
    </div>
  )
}

/**
 * Fixed-height (12 px) feedback row that sits below an input.
 *
 * Always occupies h-3 (12 px) regardless of visibility — the parent wrapper
 * uses a matching negative margin (-mb-{gap}) so this height replaces the
 * container gap rather than adding to it. No layout shift when errors toggle.
 */
export interface FieldFeedbackProps {
  visible: boolean
  color: 'red' | 'teal'
  children: ReactNode
}

export function FieldFeedback({ visible, color, children }: FieldFeedbackProps) {
  return (
    <p
      role={color === 'red' && visible ? 'alert' : undefined}
      className={`h-6 pt-1 pl-2 text-[9px] font-medium leading-3
        transition-[opacity,transform] duration-200 ease-out ${
        color === 'teal' ? 'text-[#2EC4B6]' : 'text-[#FF4F4F]'
      } ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}
    >
      {children}
    </p>
  )
}
