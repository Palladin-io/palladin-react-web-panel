import { describe, expect, it } from 'vitest'
import {
  MNEMONIC_WORD_COUNT,
  VERIFICATION_WORD_COUNT,
  generateRecoveryMnemonic,
  joinMnemonic,
  pickVerificationIndices,
} from './mnemonic'

describe('generateRecoveryMnemonic', () => {
  it('produces a 24-word phrase', () => {
    const words = generateRecoveryMnemonic()
    expect(words).toHaveLength(MNEMONIC_WORD_COUNT)
    for (const word of words) {
      expect(word.length).toBeGreaterThan(0)
    }
  })

  it('produces a different phrase each call', () => {
    const a = generateRecoveryMnemonic()
    const b = generateRecoveryMnemonic()
    expect(joinMnemonic(a)).not.toBe(joinMnemonic(b))
  })
})

describe('pickVerificationIndices', () => {
  it('returns unique indices within range', () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const indices = pickVerificationIndices()
      expect(indices).toHaveLength(VERIFICATION_WORD_COUNT)
      expect(new Set(indices).size).toBe(VERIFICATION_WORD_COUNT)
      for (const i of indices) {
        expect(i).toBeGreaterThanOrEqual(0)
        expect(i).toBeLessThan(MNEMONIC_WORD_COUNT)
      }
    }
  })

  it('returns indices sorted ascending', () => {
    const indices = pickVerificationIndices()
    const sorted = [...indices].sort((a, b) => a - b)
    expect(indices).toEqual(sorted)
  })
})
