import type { ReactNode, SelectHTMLAttributes } from 'react'
import { Icon } from './icon'

/**
 * Native `<select>` styled to match {@link FormInput} — same border, radius,
 * padding, and focus treatment, with a chevron affordance. Use everywhere a
 * dropdown is needed instead of hand-styling a raw `<select>`. Pass `<option>`s
 * as children.
 */
export interface FormSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  id: string
  /** Optional field label rendered above the control. */
  label?: string
  /** Override the default label className when different styling is needed. */
  labelClassName?: string
  children: ReactNode
}

export function FormSelect({
  id,
  label,
  labelClassName,
  children,
  ...props
}: FormSelectProps) {
  return (
    <div>
      {label ? (
        <label
          htmlFor={id}
          className={
            labelClassName ??
            'mb-1.5 block text-meta font-semibold text-[var(--cv-label-text)]'
          }
        >
          {label}
        </label>
      ) : null}
      <div className="relative">
        <select
          id={id}
          className="h-control w-full appearance-none rounded-lg border border-[var(--cv-input-border)]
            bg-[var(--cv-input-bg)] pl-3 pr-10 text-ui text-[var(--cv-input-text)]
            focus:border-[var(--cv-t1)] focus:outline-none disabled:cursor-not-allowed
            disabled:opacity-40"
          {...props}
        >
          {children}
        </select>
        <Icon
          name="expand_more"
          size={18}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--cv-t3)]"
        />
      </div>
    </div>
  )
}
