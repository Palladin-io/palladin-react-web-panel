import { describe, expect, it } from 'vitest'
import { grantReasonCoordinateKey } from './grant-reason-coordinate'

describe('grantReasonCoordinateKey', () => {
  const original = {
    id: 'grant-1',
    vaultId: 'vault-1',
    entryId: 'entry-1',
    agentId: 'agent-1',
  }

  it.each([
    ['grant id', { id: 'grant-2' }],
    ['Vault', { vaultId: 'vault-2' }],
    ['Entry', { entryId: 'entry-2' }],
    ['Agent', { agentId: 'agent-2' }],
  ])('changes when the authenticated %s coordinate changes', (_label, change) => {
    expect(grantReasonCoordinateKey({ ...original, ...change })).not.toBe(
      grantReasonCoordinateKey(original),
    )
  })
})
