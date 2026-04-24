import { generateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

/** BIP-39 24-word phrase requires 256 bits of entropy. */
const MNEMONIC_STRENGTH_BITS = 256
export const MNEMONIC_WORD_COUNT = 24
export const VERIFICATION_WORD_COUNT = 3

export function generateRecoveryMnemonic(): string[] {
  return generateMnemonic(wordlist, MNEMONIC_STRENGTH_BITS).split(' ')
}

export function joinMnemonic(words: string[]): string {
  return words.join(' ')
}

/**
 * Pick N distinct word positions from a mnemonic for the confirm screen.
 * Uses the browser CSPRNG so the quiz isn't predictable. Indices are sorted
 * ascending so they're presented to the user in reading order (Word #3,
 * then #11, then #19 — not a jumbled list).
 */
export function pickVerificationIndices(
  mnemonicLength: number = MNEMONIC_WORD_COUNT,
  count: number = VERIFICATION_WORD_COUNT,
): number[] {
  if (count >= mnemonicLength) {
    return Array.from({ length: mnemonicLength }, (_, i) => i)
  }

  const picked = new Set<number>()
  const buffer = new Uint32Array(1)

  while (picked.size < count) {
    crypto.getRandomValues(buffer)
    picked.add(buffer[0] % mnemonicLength)
  }

  return Array.from(picked).sort((a, b) => a - b)
}
