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
  'lock',
  'work',
  'home',
] as const

export const VAULT_ICON_COLORS: Record<string, string> = {
  shield: '#FF4F4F',
  folder: '#FFAB87',
  cloud: '#60A5FA',
  code: '#2EC4B6',
  database: '#8A95A6',
  key: '#8A95A6',
  lock: '#FF4F4F',
  work: '#FFAB87',
  home: '#A78BFA',
  // Extended — used by the icon browser
  vpn_key: '#2EC4B6',
  security: '#FF4F4F',
  fingerprint: '#FF4F4F',
  password: '#8A95A6',
  enhanced_encryption: '#2EC4B6',
  folder_open: '#FFAB87',
  storage: '#60A5FA',
  archive: '#8A95A6',
  inventory: '#8A95A6',
  cloud_upload: '#60A5FA',
  terminal: '#2EC4B6',
  laptop: '#60A5FA',
  smartphone: '#60A5FA',
  computer: '#60A5FA',
  memory: '#8A95A6',
  router: '#8A95A6',
  hub: '#8A95A6',
  devices: '#60A5FA',
  business: '#FFAB87',
  corporate_fare: '#FFAB87',
  account_balance: '#FFAB87',
  badge: '#A78BFA',
  admin_panel_settings: '#FF4F4F',
  person: '#A78BFA',
  people: '#A78BFA',
  favorite: '#FF4F4F',
  star: '#FFAB87',
  credit_card: '#FFAB87',
  wallet: '#2EC4B6',
  payments: '#2EC4B6',
  savings: '#2EC4B6',
  currency_bitcoin: '#FFAB87',
  email: '#60A5FA',
  chat: '#2EC4B6',
  phone: '#2EC4B6',
  forum: '#60A5FA',
  category: '#8A95A6',
  label: '#8A95A6',
  bookmark: '#A78BFA',
  school: '#60A5FA',
  sports_esports: '#A78BFA',
  // Extended batch 2
  public: '#60A5FA',
  settings: '#8A95A6',
  api: '#2EC4B6',
  extension: '#A78BFA',
  bolt: '#FFAB87',
  notifications: '#60A5FA',
}

/** Full browsable icon set — 50 icons shown in the icon browser dialog. */
export const VAULT_ICON_ALL = [
  'shield', 'lock', 'key', 'vpn_key', 'security', 'fingerprint', 'password', 'enhanced_encryption',
  'folder', 'folder_open', 'database', 'cloud', 'storage', 'archive', 'inventory', 'cloud_upload',
  'code', 'terminal', 'laptop', 'smartphone', 'computer', 'memory', 'router', 'hub', 'devices', 'api', 'extension',
  'work', 'business', 'corporate_fare', 'account_balance', 'badge', 'admin_panel_settings', 'settings',
  'home', 'person', 'people', 'favorite', 'star', 'bolt',
  'credit_card', 'wallet', 'payments', 'savings', 'currency_bitcoin',
  'email', 'chat', 'phone', 'forum', 'notifications',
  'category', 'label', 'bookmark', 'school', 'sports_esports', 'public',
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
