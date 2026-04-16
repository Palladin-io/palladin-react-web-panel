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
}

export function FormInput({
  label,
  id,
  labelClassName,
  borderClass,
  ...props
}: FormInputProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className={
          labelClassName ??
          'mb-1 block text-[11px] font-semibold text-[#B8C5D4]'
        }
      >
        {label}
      </label>
      <input
        id={id}
        className={`w-full rounded-lg border bg-[rgba(253,249,228,0.04)] px-3 py-2 text-sm
          text-[#FDF9E4] placeholder:text-[#6B7A8E] focus:outline-none ${
          borderClass ?? 'border-[rgba(253,249,228,0.1)] focus:border-[#2EC4B6]'
        }`}
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
      className="relative mt-1 h-4 overflow-hidden"
      role={color === 'red' && visible ? 'alert' : undefined}
    >
      <p
        className={`absolute inset-x-0 flex items-center gap-1 text-[11px] leading-4
          transition-[opacity,translate] duration-200 ease-out ${
          color === 'teal' ? 'text-[#2EC4B6]' : 'text-[#FF4F4F]'
        } ${visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}
      >
        {children}
      </p>
    </div>
  )
}
