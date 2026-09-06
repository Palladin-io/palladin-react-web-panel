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
        'flex h-control w-full items-center justify-center gap-2 rounded-lg bg-[var(--cv-primary)] px-4 ' +
        'text-ui font-semibold text-white ' +
        'shadow-[0_2px_10px_rgb(var(--cv-primary-rgb)/0.22)] transition-[background-color,box-shadow] ' +
        'hover:bg-[var(--cv-primary-hover)] hover:shadow-[0_2px_14px_rgb(var(--cv-primary-rgb)/0.3)] ' +
        'disabled:cursor-not-allowed disabled:bg-[var(--cv-auth-primary-disabled-bg)] ' +
        'disabled:text-[var(--cv-auth-primary-disabled-text)] disabled:shadow-none' +
        (className ? ` ${className}` : '')
      }
    >
      {children}
    </button>
  )
}
