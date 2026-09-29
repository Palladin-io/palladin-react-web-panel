/**
 * Shared interactive element class strings — edit here to update hover/focus
 * effects for VaultCard, EntryRow, and any future interactive list items
 * in one place. Never inline custom hover:border-* on card-like elements.
 */
export const HOVERABLE_CARD_CLASSES = [
  'rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]',
  'transition-colors duration-150 ease-out',
  'hover:bg-[var(--cv-card-hover)]',
  'focus-visible:outline-none focus-visible:border-[var(--cv-t1)]',
].join(' ')

export const SELECTED_NAVIGATION_CARD_CLASSES =
  '!border-[var(--cv-t1)] bg-[var(--cv-btn-subtle-bg)]'

/**
 * Canonical geometry for compact metadata/status pills in list and detail
 * headers. Semantic foreground/background colours remain the caller's job.
 */
export const METADATA_BADGE_CLASSES =
  'inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-micro font-semibold leading-none'

/**
 * Canonical title row for master columns inside Settings. Combined with the
 * surrounding 16px top padding and 16px bottom gap it occupies the same 72px
 * vertical band as the Settings rail header.
 */
export const SETTINGS_MASTER_HEADER_CLASSES =
  'mb-4 flex h-10 shrink-0 items-center gap-2'
