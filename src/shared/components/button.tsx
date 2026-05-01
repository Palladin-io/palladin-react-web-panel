import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon } from './icon'

export type ButtonVariant = 'accent' | 'subtle' | 'outline' | 'ghost' | 'danger' | 'premium'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Material Symbols glyph name rendered before the label. */
  icon?: string
  children?: ReactNode
  /** Append extra utility classes (kept narrow — most styling is built-in). */
  className?: string
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-[11px] font-semibold rounded-lg gap-1.5',
  md: 'px-3.5 py-2 text-[13px] font-semibold rounded-lg gap-2',
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  accent:
    'bg-[#FF4F4F] text-white hover:bg-[#E04545] disabled:bg-[#FF4F4F]/50',
  subtle:
    'bg-[var(--cv-btn-subtle-bg)] text-[var(--cv-btn-subtle-text)] border border-[var(--cv-btn-subtle-border)] hover:bg-[var(--cv-btn-subtle-hover)]',
  outline:
    'bg-transparent text-[var(--cv-btn-outline-text)] border border-[var(--cv-btn-outline-border)] hover:bg-[var(--cv-btn-outline-hover)]',
  ghost:
    'bg-transparent text-[var(--cv-btn-ghost-text)] hover:bg-[var(--cv-btn-ghost-hover)]',
  danger:
    'bg-[rgba(255,79,79,0.12)] text-[#FF4F4F] border border-[rgba(255,79,79,0.25)] hover:bg-[rgba(255,79,79,0.18)]',
  premium:
    'bg-transparent text-[#E8C87A] font-bold border border-[#E8C87A]/40 hover:border-[#E8C87A]/70 hover:bg-[#E8C87A]/[0.07] hover:translate-x-0.5',
}

/** Shared base classes — exported so Link elements can carry premium styling. */
const BASE_CLASS =
  'inline-flex items-center justify-center transition-[colors,transform] disabled:cursor-not-allowed disabled:opacity-60'

/** Ready-made class string for the `sm` premium button — apply to `<Link>` elements. */
export const PREMIUM_BUTTON_SM_CLASS =
  `${BASE_CLASS} ${SIZE_CLASS.sm} ${VARIANT_CLASS.premium}`

/**
 * Pill-shaped button used by the vault list, detail header, and
 * settings forms. Mirrors the Astro `Button.astro` API (variant / size
 * / icon) so design and React stay aligned. Heavy lifting is in the
 * Tailwind class lookup tables — keeping the component itself trivial.
 */
export function Button({
  variant = 'accent',
  size = 'md',
  icon,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const sizeClass = SIZE_CLASS[size]
  const variantClass = VARIANT_CLASS[variant]
  const composed =
    `${BASE_CLASS} ${sizeClass} ${variantClass}` +
    (className ? ` ${className}` : '')
  return (
    <button {...rest} type={type} className={composed}>
      {icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </button>
  )
}
