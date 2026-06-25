/**
 * CSS `background` value shared by every full-screen auth surface
 * (login, unlock, onboarding, recovery). Kept as a single constant so
 * all those screens stay visually identical when the palette evolves.
 */
export const AUTH_BACKGROUND_GRADIENT =
  'linear-gradient(160deg, #181A1D 0%, #212429 30%, #1D1F23 60%, #181A1D 100%)'

/**
 * Shared interactive element class strings — edit here to update hover/focus
 * effects for VaultCard, EntryRow, and any future interactive list items
 * in one place. Never inline custom hover:border-* on card-like elements.
 */
export const HOVERABLE_CARD_CLASSES = [
  'rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]',
  'dark:shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-[border-color,box-shadow] duration-200 ease-out',
  'hover:shadow-[0_4px_14px_rgba(0,0,0,0.07)] dark:hover:shadow-[0_4px_18px_rgba(0,0,0,0.35)] dark:hover:border-[var(--cv-t1)]',
  'focus-visible:outline-none focus-visible:border-[var(--cv-t1)]',
].join(' ')
