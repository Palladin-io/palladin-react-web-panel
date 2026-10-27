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
  '!border-[var(--cv-t1)] text-[var(--cv-t1)]'

/** Shared quiet geometry for descriptive and status labels (variant B). */
export const METADATA_BADGE_CLASSES =
  'metadata-badge inline-flex min-h-badge shrink-0 items-center gap-1 rounded-md border border-[var(--cv-border)] bg-[var(--cv-card-bg)] px-2 py-0.5 text-micro font-medium leading-tight'

/**
 * Canonical title row for master columns inside Settings. Combined with the
 * surrounding 16px top padding and 16px bottom gap it occupies the same 72px
 * vertical band as the Settings rail header.
 */
export const SETTINGS_MASTER_HEADER_CLASSES =
  'app-master-header mb-4 flex h-10 shrink-0 items-center gap-2'

/** Shared frame and image inset for Entry, Agent and Vault identities. */
export const ENTITY_ICON_FRAME_CLASSES =
  'inline-flex shrink-0 items-center justify-center rounded-lg border border-[var(--cv-border)]'

export const ENTITY_ICON_IMAGE_CLASSES = 'h-[62.5%] w-[62.5%] object-contain'

/** Shared selected-tab treatment for detail panels and the Inbox segments. */
export const TAB_BUTTON_CLASSES =
  'inline-flex h-action shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent px-3 text-ui font-medium transition-colors text-[var(--cv-t3)] hover:text-[var(--cv-t1)] aria-selected:border-[var(--cv-t1)] aria-selected:text-[var(--cv-t1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cv-primary)] disabled:cursor-not-allowed disabled:opacity-40'

export const SELECTED_NAVIGATION_LINK_CLASSES =
  'text-[var(--cv-t1)] shadow-[inset_0_0_0_1px_var(--cv-t1)]'


/** Extension-style navigation rows keep the neutral selected outline. */
export const NAVIGATION_ROW_CLASSES =
  'rounded-lg border border-transparent bg-transparent transition-colors hover:bg-[var(--cv-card-hover)] focus-visible:outline-none focus-visible:border-[var(--cv-t1)]'

export const DETAIL_SURFACE_CLASSES =
  'rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] shadow-[var(--cv-panel-card-shadow)]'
