import { describe, expect, it } from 'vitest'
import { initialSharingForm, sharingFieldInvalid } from './sharing-form'

describe('sender protection input', () => {
  it.each(['000000', '111111', '123456', '654321', '789012', '210987', '121212', '123123'])('rejects obvious PIN %s', (protectionSecret) => {
    expect(sharingFieldInvalid({ ...initialSharingForm, protection: 'pin', protectionSecret }, 'protectionSecret')).toBe(true)
  })
  it.each(['739284', '48291563'])('accepts non-obvious PIN %s', (protectionSecret) => {
    expect(sharingFieldInvalid({ ...initialSharingForm, protection: 'pin', protectionSecret }, 'protectionSecret')).toBe(false)
  })
})
