import { encodeEmergencyKitQr, formatSecretKey } from '@palladin/crypto'
import { describe, expect, it } from 'vitest'
import { emergencyKitMaterial, parseSecretKeyInput } from './secret-key'

const accountId = '11111111-1111-4111-8111-111111111111'
const otherAccount = '22222222-2222-4222-8222-222222222222'
const secret = Uint8Array.from({ length: 32 }, (_, index) => index + 1)

describe('Secret Key input', () => {
  it('accepts the typed display form in any case and with spaces, and the pasted kit QR text', () => {
    const display = formatSecretKey(accountId, secret)
    expect(Array.from(parseSecretKeyInput(accountId, display.toLowerCase().replaceAll('-', ' ')))).toEqual(Array.from(secret))
    expect(Array.from(parseSecretKeyInput(accountId, ` ${encodeEmergencyKitQr(accountId, secret)} `))).toEqual(Array.from(secret))
  })

  it('rejects a key of another account by checksum and a kit of another account before deriving', () => {
    expect(() => parseSecretKeyInput(otherAccount, formatSecretKey(accountId, secret)))
      .toThrow(expect.objectContaining({ code: 'secret-key-checksum-mismatch' }))
    expect(() => parseSecretKeyInput(otherAccount, encodeEmergencyKitQr(accountId, secret)))
      .toThrow(expect.objectContaining({ code: 'account-mismatch' }))
    expect(() => parseSecretKeyInput(accountId, 'PSK2-NOT-A-KEY')).toThrow(expect.objectContaining({ code: 'secret-key-malformed' }))
  })

  it('builds kit values only for the account the key belongs to', () => {
    const kit = emergencyKitMaterial(accountId, 'user@example.com', secret)
    expect(kit).toEqual({ email: 'user@example.com', secretKey: formatSecretKey(accountId, secret),
      qrPayload: encodeEmergencyKitQr(accountId, secret) })
  })
})
