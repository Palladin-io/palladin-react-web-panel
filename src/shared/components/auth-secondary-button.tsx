import type { ButtonHTMLAttributes } from 'react'

export type AuthSecondaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement>

/** Glass secondary action on auth surfaces, paired with the solid `AuthSubmitButton`. */
export function AuthSecondaryButton({ className = '', type = 'button', ...props }: AuthSecondaryButtonProps) {
  return (
    <button
      type={type}
      className={`auth-glass-button flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2
        text-meta font-semibold ${className}`}
      {...props}
    />
  )
}
