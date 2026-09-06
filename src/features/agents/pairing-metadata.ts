const FORBIDDEN_METADATA = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u
const SETUP_PREFIX = 'PALLADIN_AGENT_SETUP_V1:'

export function agentProfileId(displayName: string): string | null {
  const slug = displayName.toLowerCase().replaceAll('ł', 'l')
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '')
    .slice(0, 64).replace(/-+$/u, '')
  if (!slug) return null
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/u.test(slug) ? `agent-${slug}` : slug
}

export function normalizeAgentMetadata(
  value: string,
  maximumCodePoints: number,
): string | null {
  const normalized = value.trim().normalize('NFC')
  if (normalized.length === 0) return null
  if (
    Array.from(normalized).length > maximumCodePoints ||
    FORBIDDEN_METADATA.test(normalized)
  ) {
    return null
  }
  return normalized
}

function base64UrlEncode(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

export function createAgentSetupDescriptor(displayName: string): string {
  const normalized = normalizeAgentMetadata(displayName, 64)
  const payload = normalized
    ? { v: 1, userPreferredDisplayName: normalized }
    : { v: 1 }
  const json = new TextEncoder().encode(JSON.stringify(payload))
  return `${SETUP_PREFIX}${base64UrlEncode(json)}`
}

const FRIENDLY_NAMES = {
  pl: [
    'Bursztynowy Lis', 'Spokojna Wydra', 'Srebrny Ryś', 'Ciekawy Żuraw',
    'Łagodny Borsuk', 'Zwinny Sokół', 'Radosna Kuna', 'Mądra Sowa',
    'Odważny Jeleń', 'Pogodny Delfin', 'Cichy Wilk', 'Złota Pszczoła',
    'Leśny Zając', 'Błękitna Ważka', 'Bystry Szop', 'Wesoła Foka',
    'Szmaragdowy Kret', 'Cierpliwy Żółw', 'Dzielna Łasica', 'Świetlisty Łabędź',
    'Miła Alpaka', 'Uważny Kruk', 'Słoneczna Salamandra', 'Rześki Koziorożec',
  ],
  en: [
    'Amber Fox', 'Calm Otter', 'Silver Lynx', 'Curious Crane',
    'Gentle Badger', 'Swift Falcon', 'Joyful Marten', 'Wise Owl',
    'Brave Deer', 'Bright Dolphin', 'Quiet Wolf', 'Golden Bee',
    'Forest Hare', 'Azure Dragonfly', 'Clever Raccoon', 'Happy Seal',
    'Emerald Mole', 'Patient Turtle', 'Bold Weasel', 'Luminous Swan',
    'Kind Alpaca', 'Watchful Raven', 'Sunny Salamander', 'Fresh Ibex',
  ],
} as const

function secureIndex(length: number): number {
  const maximum = Math.floor(0x1_0000_0000 / length) * length
  const buffer = new Uint32Array(1)
  do crypto.getRandomValues(buffer)
  while (buffer[0] >= maximum)
  return buffer[0] % length
}

export function createFriendlyAgentName(
  language: string,
  excluded: ReadonlySet<string> = new Set(),
): string {
  const names = language.toLowerCase().startsWith('pl')
    ? FRIENDLY_NAMES.pl
    : FRIENDLY_NAMES.en
  const available = names.filter((name) => !excluded.has(name))
  if (available.length === 0) throw new Error('friendly-name-exhausted')
  return available[secureIndex(available.length)]
}

export const FRIENDLY_AGENT_NAME_COUNT = FRIENDLY_NAMES.en.length
