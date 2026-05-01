/**
 * Presentation constants shared by the create-vault dialog and the vault
 * settings form. Co-locating them here keeps the icon set, the colour
 * palette, and their default fallbacks in one place — adding a new icon
 * or tweaking the palette only needs to happen once.
 */

export const VAULT_ICON_OPTIONS = [
  '🔒',
  '🔑',
  '🗝️',
  '🏦',
  '📁',
  '💼',
  '🛡️',
  '⚙️',
  '🔐',
  '🌐',
] as const

export const VAULT_COLOR_OPTIONS = [
  '#2EC4B6',
  '#FF4F4F',
  '#F59E0B',
  '#60A5FA',
  '#A78BFA',
  '#34D399',
  '#F97316',
  '#EC4899',
  '#6B7A8E',
] as const

export const DEFAULT_VAULT_ICON = VAULT_ICON_OPTIONS[0]
export const DEFAULT_VAULT_COLOR = VAULT_COLOR_OPTIONS[0]

/**
 * Map each colour option to a stable i18n token suffix so screen readers
 * announce a human-readable name (`Teal`, `Red`, …) instead of the raw
 * hex string. The translation keys live under `vault.colorName.*` in the
 * locale files.
 */
export const VAULT_COLOR_NAME_KEY: Record<string, string> = {
  '#2EC4B6': 'teal',
  '#FF4F4F': 'red',
  '#F59E0B': 'amber',
  '#60A5FA': 'blue',
  '#A78BFA': 'violet',
  '#34D399': 'green',
  '#F97316': 'orange',
  '#EC4899': 'pink',
  '#6B7A8E': 'slate',
}
