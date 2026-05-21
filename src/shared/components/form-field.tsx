import type { InputHTMLAttributes, ReactNode } from 'react'

/**
 * Styled text input with label for onboarding and settings forms.
 *
 * Pass `borderClass` to override the border/focus-border classes when the
 * border must change dynamically (e.g. correct/wrong state on confirm step).
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
}

export function FormInput({
  label,
  id,
  labelClassName,
  borderClass,
  monospace,
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
          text-[var(--cv-input-text)] placeholder:text-[var(--cv-input-placeholder)] focus:outline-none ${
          borderClass ?? 'border-[var(--cv-input-border)] focus:border-[var(--cv-t1)]'
        }${monospace ? ' font-mono' : ''}`}
        {...props}
      />
    </div>
  )
}

/**
 * Fixed-height feedback row that sits below an input.
 *
 * The outer div always occupies `h-4` (16 px) regardless of visibility so the
 * form height never changes — no layout shift. The inner text slides down from
 * above and fades in (mirrors the Flutter AnimatedSlide + AnimatedOpacity pattern).
 */
export interface FieldFeedbackProps {
  visible: boolean
  color: 'red' | 'teal'
  children: ReactNode
}

export function FieldFeedback({ visible, color, children }: FieldFeedbackProps) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-200 ease-out"
      style={{ gridTemplateRows: visible ? '1fr' : '0fr' }}
      role={color === 'red' && visible ? 'alert' : undefined}
    >
      <div className="overflow-hidden">
        <p
          className={`pt-1 text-[11px] leading-4 transition-opacity duration-200 ${
            color === 'teal' ? 'text-[#2EC4B6]' : 'text-[#FF4F4F]'
          } ${visible ? 'opacity-100' : 'opacity-0'}`}
        >
          {children}
        </p>
      </div>
    </div>
  )
}
