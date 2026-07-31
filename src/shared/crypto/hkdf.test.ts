import { describe, expect, it } from 'vitest'
import { VAULT_XCHACHA20_POLY1305_V1 } from './crypto-suite'
import { ENVELOPE_PURPOSE } from './envelope'
import { deriveVaultSubkey } from './hkdf'

const bytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g)?.map((value) => Number.parseInt(value, 16)) ?? [])
const hex = (value: Uint8Array): string =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('')

describe('deriveVaultSubkey', () => {
  const context = {
    protocolVersion: 2,
    cryptoSuiteId: VAULT_XCHACHA20_POLY1305_V1,
    purpose: ENVELOPE_PURPOSE.memberSecret,
    organizationId: '00112233-4455-6677-8899-aabbccddeeff',
    vaultId: '11112222-3333-4444-8555-666677778888',
    entryId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    keyVersion: 3,
    memberKeyGeneration: 9,
  } as const

  it('returns a 32-byte purpose-scoped key', async () => {
    const output = await deriveVaultSubkey(bytes('0b'.repeat(32)), context)
    expect(output).toHaveLength(32)
    expect(hex(output)).toHaveLength(64)
  })

  it('does not bind resource revision and separates purpose', async () => {
    const root = bytes('0b'.repeat(32))
    const memberSecret = await deriveVaultSubkey(root, context)
    const memberIndex = await deriveVaultSubkey(root, {
      ...context,
      purpose: ENVELOPE_PURPOSE.memberIndex,
    })
    expect(memberSecret).not.toEqual(memberIndex)
  })
})
