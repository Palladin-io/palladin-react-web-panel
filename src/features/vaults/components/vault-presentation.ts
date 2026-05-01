/**
 * Presentation constants shared by the create-vault dialog and the vault
 * settings form. Co-locating them here keeps the icon set, the colour
 * palette, and their default fallbacks in one place — adding a new icon
 * or tweaking the palette only needs to happen once.
 *
 * Icons are stored as Material Symbols Rounded glyph names (rendered via
 * `<span class="mi">{name}</span>`). The same names ship from the Astro
 * design system, so vault screens stay 1:1 with the design files.
 */

export const VAULT_ICON_OPTIONS = [
  'shield',
  'folder',
  'cloud',
  'code',
  'database',
  'key',
] as const

/**
 * Accent palette mirrors the Astro design system swatches. The first
 * entry (`#FF4F4F` — accent red) is the primary action colour and the
 * default for new vaults to match the Create Vault modal mockup.
 */
export const VAULT_COLOR_OPTIONS = [
  '#FF4F4F',
  '#FFAB87',
  '#60A5FA',
  '#2EC4B6',
  '#A78BFA',
  '#8A95A6',
] as const

export const DEFAULT_VAULT_ICON = VAULT_ICON_OPTIONS[0]
export const DEFAULT_VAULT_COLOR = VAULT_COLOR_OPTIONS[0]

/**
 * Map each colour option to a stable i18n token suffix so screen readers
 * announce a human-readable name (`Red`, `Teal`, …) instead of the raw
 * hex string. The translation keys live under `vault.colorName.*` in the
 * locale files.
 */
export const VAULT_COLOR_NAME_KEY: Record<string, string> = {
  '#FF4F4F': 'red',
  '#FFAB87': 'peach',
  '#60A5FA': 'blue',
  '#2EC4B6': 'teal',
  '#A78BFA': 'violet',
  '#8A95A6': 'slate',
}
