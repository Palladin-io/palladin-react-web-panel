import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon } from './icon'

export type ButtonVariant =
  | 'accent'
  | 'subtle'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'positive'
  | 'premium'
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
  // `border border-transparent` on accent/ghost keeps them the SAME total height
  // as the bordered variants (subtle/outline/danger/positive/premium) at a given
  // size — without it a bordered button is ~2px taller and footer rows look
  // uneven (e.g. Deny vs Approve in notification cards).
  accent:
    'bg-[#FF4F4F] text-white border border-transparent hover:bg-[#E04545] disabled:bg-[#FF4F4F]/50',
  subtle:
    'bg-[var(--cv-btn-subtle-bg)] text-[var(--cv-btn-subtle-text)] border border-[var(--cv-btn-subtle-border)] hover:bg-[var(--cv-btn-subtle-hover)]',
  outline:
    'bg-transparent text-[var(--cv-btn-outline-text)] border border-[var(--cv-btn-outline-border)] hover:bg-[var(--cv-btn-outline-hover)]',
  ghost:
    'bg-transparent text-[var(--cv-btn-ghost-text)] border border-transparent hover:bg-[var(--cv-btn-ghost-hover)]',
  danger:
    'bg-[rgba(255,79,79,0.12)] text-[#FF4F4F] border border-[rgba(255,79,79,0.25)] hover:bg-[rgba(255,79,79,0.18)]',
  positive:
    'bg-[rgba(46,196,182,0.06)] text-[#2EC4B6] border border-[rgba(46,196,182,0.3)] hover:bg-[rgba(46,196,182,0.12)]',
  premium:
    'btn-premium bg-transparent font-bold border',
}

/** Shared base classes — exported so Link elements can carry premium styling.
 *  `leading-none` keeps the button height driven purely by `py` + `items-center`
 *  so an icon glyph's taller line-box (e.g. `file_upload`) can't inflate one
 *  variant's height relative to another (Import vs Add Entry parity). */
const BASE_CLASS =
  'inline-flex items-center justify-center leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-60'

/** Ready-made class string for the `sm` premium button — apply to `<Link>` elements. */
export const PREMIUM_BUTTON_SM_CLASS =
  `${BASE_CLASS} ${SIZE_CLASS.sm} ${VARIANT_CLASS.premium}`

/** Ready-made class string for the `sm` positive button — apply to `<Link>` elements
 *  that need the positive (teal) treatment but must navigate via the router. */
export const POSITIVE_BUTTON_SM_CLASS =
  `${BASE_CLASS} ${SIZE_CLASS.sm} ${VARIANT_CLASS.positive}`

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
