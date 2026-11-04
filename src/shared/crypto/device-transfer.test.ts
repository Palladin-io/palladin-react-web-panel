import { describe, expect, it } from 'vitest'
import { toBase64Url } from './encoding'
import {
  createTransferKeyPair,
  openTransferEnvelope,
  recipientTransferQr,
  sealSecretKeyForTransfer,
  senderTransferQr,
  transferSas,
} from './device-transfer'

const accountId = '11111111-1111-4111-8111-111111111111'
const transferId = 'AABBCCDD-EEFF-4011-8233-445566778899'
const challenge = toBase64Url(new Uint8Array(32).fill(7))
const secret = new Uint8Array(32).fill(9)

describe('Secret Key transfer', () => {
  it('encodes the transfer UUID as its 16 network-order bytes in both QR flows', () => {
    const wireId = toBase64Url(Uint8Array.from([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x40, 0x11, 0x82, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99]))
    expect(senderTransferQr(transferId, challenge)).toBe(`palladin-pair:v2:s:${wireId}.${challenge}`)
  })

  it('delivers the Secret Key only to the device whose session values match the SAS both sides showed', async () => {
    const recipient = await createTransferKeyPair()
    const session = { accountId, transferId, challenge, recipientPublicKey: recipient.publicKey }
    expect(recipientTransferQr(transferId, recipient.publicKey)).toMatch(/^palladin-pair:v2:r:/)
    expect(transferSas(session)).toMatch(/^[0-9a-z]{5}-[0-9a-z]{5}$/)

    const envelope = await sealSecretKeyForTransfer(session, true, secret)
    const opened = await openTransferEnvelope({ accountId, transferId, challenge }, recipient, envelope)
    expect(Array.from(opened)).toEqual(Array.from(secret))

    await expect(openTransferEnvelope({ accountId, transferId, challenge: toBase64Url(new Uint8Array(32)) }, recipient, envelope))
      .rejects.toMatchObject({ code: 'aead-failure' })
    await expect(openTransferEnvelope({ accountId: '22222222-2222-4222-8222-222222222222', transferId, challenge }, recipient, envelope))
      .rejects.toMatchObject({ code: 'aead-failure' })
  })

  it('never seals before the user confirmed the codes match', async () => {
    const recipient = await createTransferKeyPair()
    await expect(sealSecretKeyForTransfer({ accountId, transferId, challenge, recipientPublicKey: recipient.publicKey }, false, secret))
      .rejects.toMatchObject({ code: 'sas-not-confirmed' })
  })

  it('shows different codes when the relayed recipient key was substituted', async () => {
    const [genuine, substituted] = await Promise.all([createTransferKeyPair(), createTransferKeyPair()])
    expect(transferSas({ accountId, transferId, challenge, recipientPublicKey: genuine.publicKey }))
      .not.toBe(transferSas({ accountId, transferId, challenge, recipientPublicKey: substituted.publicKey }))
  })
})
