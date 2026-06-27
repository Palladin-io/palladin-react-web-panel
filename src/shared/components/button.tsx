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

// Fixed height per size (no `py`) so a button's height is constant regardless
// of content — an `icon` glyph (14/16px) has a taller line-box than the text
// (11/13px), which previously made icon buttons taller than plain ones even
// with `leading-none`. With `h-7`/`h-9` every button of a given size is
// pixel-identical: icon vs no icon, bordered vs borderless.
//   sm → 28px (h-7), was ~27px (py-1.5 + 11px text + 1px border) → +1px
//   md → 36px (h-9), was ~34px (py-2 + 13px text + 1px border) → +2px
const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[11px] font-semibold rounded-lg gap-1.5',
  md: 'h-9 px-3.5 text-[13px] font-semibold rounded-lg gap-2',
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  // `border border-transparent` on accent/ghost keeps them the SAME total height
  // as the bordered variants (subtle/outline/danger/positive/premium) at a given
  // size — without it a bordered button is ~2px taller and footer rows look
  // uneven (e.g. Deny vs Approve in notification cards).
  accent:
    'bg-[var(--cv-primary)] text-white border border-transparent hover:bg-[var(--cv-primary-hover)] disabled:bg-[rgb(var(--cv-primary-rgb)/0.5)]',
  subtle:
    'bg-[var(--cv-btn-subtle-bg)] text-[var(--cv-btn-subtle-text)] border border-[var(--cv-btn-subtle-border)] hover:bg-[var(--cv-btn-subtle-hover)]',
  outline:
    'bg-transparent text-[var(--cv-btn-outline-text)] border border-[var(--cv-btn-outline-border)] hover:bg-[var(--cv-btn-outline-hover)]',
  ghost:
    'bg-transparent text-[var(--cv-btn-ghost-text)] border border-transparent hover:bg-[var(--cv-btn-ghost-hover)]',
  danger:
    'bg-[rgb(var(--cv-primary-rgb)/0.12)] text-[var(--cv-primary)] border border-[rgb(var(--cv-primary-rgb)/0.25)] hover:bg-[rgb(var(--cv-primary-rgb)/0.18)]',
  positive:
    'bg-[rgba(16,185,129,0.12)] text-[#10B981] border border-[rgba(16,185,129,0.3)] hover:bg-[rgba(16,185,129,0.18)]',
  premium:
    'btn-premium bg-transparent font-bold border',
}

/** Shared base classes — exported so Link elements can carry button styling.
 *  Height comes from the fixed `h-*` in SIZE_CLASS; `items-center` +
 *  `leading-none` keep the label/icon centred within that fixed height. */
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
  size = 'sm',
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
