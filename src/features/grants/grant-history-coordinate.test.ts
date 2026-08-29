import { describe, expect, it } from 'vitest'
import { grantHistoryCoordinateKey } from './use-grant-history-metadata'

describe('grantHistoryCoordinateKey', () => {
  const original = {
    type: 'grant_approved' as const,
    grantId: 'grant-1',
    vaultId: 'vault-1',
    entryId: 'entry-1',
    agentId: 'agent-1',
  }

  it.each([
    ['event type', { type: 'grant_revoked' as const }],
    ['grant id', { grantId: 'grant-2' }],
    ['Vault', { vaultId: 'vault-2' }],
    ['Entry', { entryId: 'entry-2' }],
    ['Agent', { agentId: 'agent-2' }],
  ])('changes when the authenticated %s coordinate changes', (_label, change) => {
    expect(grantHistoryCoordinateKey({ ...original, ...change })).not.toBe(
      grantHistoryCoordinateKey(original),
    )
  })
})
