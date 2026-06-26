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
            ? 'border-[var(--cv-primary)] focus:border-[var(--cv-primary)]'
            : 'border-[var(--cv-input-border)] focus:border-[var(--cv-t1)]')
        }${monospace ? ' font-mono' : ''}`}
        {...props}
      />
    </div>
  )
}

/**
 * Fixed-height (16 px) feedback row that sits below an input.
 *
 * Always occupies h-4 (16 px) regardless of visibility — the parent wrapper
 * uses a matching negative margin (`-mb-4`) so this height replaces the
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
      className={`h-4 pt-[3px] pl-2 text-[9px] font-medium leading-3
        transition-[opacity,transform] duration-200 ease-out ${
        color === 'teal' ? 'text-[#10B981]' : 'text-[var(--cv-primary)]'
      } ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}
    >
      {children}
    </p>
  )
}

/**
 * Feedback that animates its OWN height so the fields below slide down/up
 * smoothly when it appears/disappears (instead of jumping). Uses the
 * grid `0fr → 1fr` rows trick — stays mounted, so it animates both ways.
 * No reserved space when hidden (the row collapses to 0).
 */
export function FeedbackSlot({ visible, color, children }: FieldFeedbackProps) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-200 ease-out"
      style={{ gridTemplateRows: visible ? '1fr' : '0fr' }}
    >
      <div className="overflow-hidden">
        <FieldFeedback visible={visible} color={color}>
          {children}
        </FieldFeedback>
      </div>
    </div>
  )
}
