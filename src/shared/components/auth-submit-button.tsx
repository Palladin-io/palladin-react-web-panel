import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface AuthSubmitButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  children: ReactNode
  /** Optional spacing utilities (e.g. `mt-2`); visual styling stays built-in. */
  className?: string
}

/**
 * Full-width primary CTA shared by the auth flows (onboarding, unlock,
 * recovery) so all three are pixel-identical. Separate from the panel
 * `Button` — these are hero actions on the gradient auth screens, not the
 * compact `sm` pills used inside the app.
 */
export function AuthSubmitButton({
  children,
  className,
  type = 'submit',
  ...rest
}: AuthSubmitButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={
        'w-full rounded-lg bg-[#FF4F4F] px-4 py-2.5 text-sm font-semibold text-white ' +
        'shadow-[0_2px_10px_rgba(255,79,79,0.22)] transition-[background-color,box-shadow] ' +
        'hover:bg-[#E04545] hover:shadow-[0_2px_14px_rgba(255,79,79,0.3)] ' +
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none' +
        (className ? ` ${className}` : '')
      }
    >
      {children}
    </button>
  )
}
