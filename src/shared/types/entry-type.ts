/** Entry types shared across feature boundaries and the encrypted Vault protocol. */
export const ENTRY_TYPE_KEY = 0 as const
export const ENTRY_TYPE_CREDENTIAL = 1 as const
export const ENTRY_TYPE_SCRIPT = 2 as const
export const ENTRY_TYPE_CREDIT_CARD = 3 as const

export type EntryType =
  | typeof ENTRY_TYPE_KEY
  | typeof ENTRY_TYPE_CREDENTIAL
  | typeof ENTRY_TYPE_SCRIPT
  | typeof ENTRY_TYPE_CREDIT_CARD

/** Accept both the API's enum strings and numeric values used by older clients/tests. */
export function normalizeEntryType(raw: unknown): EntryType {
  const value = typeof raw === 'string' ? raw.toLowerCase() : raw
  if (value === 'key' || value === ENTRY_TYPE_KEY) return ENTRY_TYPE_KEY
  if (value === 'script' || value === ENTRY_TYPE_SCRIPT) return ENTRY_TYPE_SCRIPT
  if (value === 'creditcard' || value === 'credit_card' || value === ENTRY_TYPE_CREDIT_CARD) {
    return ENTRY_TYPE_CREDIT_CARD
  }
  return ENTRY_TYPE_CREDENTIAL
}
