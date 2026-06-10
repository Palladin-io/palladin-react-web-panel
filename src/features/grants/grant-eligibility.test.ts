import { describe, expect, it } from 'vitest'
import {
  agentsCoveringEntry,
  agentsCoveringVault,
  entryCoverageByAgent,
  vaultsCoveredByAgent,
} from './grant-eligibility'
import type { OrgGrant } from './api/org-grants-api'

function grant(partial: Partial<OrgGrant>): OrgGrant {
  return {
    id: 'g',
    vaultId: 'v1',
    status: 'active',
    createdAt: '2026-06-01T00:00:00Z',
    queryCount: 0,
    canRevoke: false,
    canGrantAgain: false,
    ...partial,
  } as OrgGrant
}

describe('grant-eligibility', () => {
  it('agentsCoveringVault collects only agents with an active FULL grant', () => {
    const set = agentsCoveringVault([
      grant({ agentId: 'fullActive', status: 'active', type: 'full' }),
      grant({ agentId: 'granular', status: 'active', type: 'granular' }), // eligible — upgradable to FULL
      grant({ agentId: 'fullRevoked', status: 'revoked', type: 'full' }), // ignored — not active
    ])
    expect(set.has('fullActive')).toBe(true)
    expect(set.has('granular')).toBe(false)
    expect(set.has('fullRevoked')).toBe(false)
  })

  it('agentsCoveringEntry covers active FULL on vault OR active GRANULAR on entry', () => {
    const set = agentsCoveringEntry(
      [
        grant({ agentId: 'full', type: 'full' }),
        grant({ agentId: 'granularMatch', type: 'granular', entryId: 'e1' }),
        grant({ agentId: 'granularOther', type: 'granular', entryId: 'e2' }),
        grant({ agentId: 'inactive', type: 'full', status: 'expired' }),
      ],
      'e1',
    )
    expect(set.has('full')).toBe(true)
    expect(set.has('granularMatch')).toBe(true)
    expect(set.has('granularOther')).toBe(false)
    expect(set.has('inactive')).toBe(false)
  })

  it('vaultsCoveredByAgent collects only vaults with an active FULL grant', () => {
    const set = vaultsCoveredByAgent([
      grant({ vaultId: 'vFull', status: 'active', type: 'full' }),
      grant({ vaultId: 'vGranular', status: 'active', type: 'granular' }), // eligible — upgradable to FULL
      grant({ vaultId: 'vDenied', status: 'denied', type: 'full' }),
    ])
    expect(set.has('vFull')).toBe(true)
    expect(set.has('vGranular')).toBe(false)
    expect(set.has('vDenied')).toBe(false)
  })

  it('entryCoverageByAgent splits granular entries from full-covered vaults', () => {
    const { coveredEntryIds, fullCoveredVaultIds } = entryCoverageByAgent([
      grant({ type: 'granular', entryId: 'e1', vaultId: 'v1' }),
      grant({ type: 'full', vaultId: 'v2' }),
      grant({ type: 'granular', entryId: 'e3', vaultId: 'v3', status: 'revoked' }),
    ])
    expect(coveredEntryIds.has('e1')).toBe(true)
    expect(coveredEntryIds.has('e3')).toBe(false) // inactive
    expect(fullCoveredVaultIds.has('v2')).toBe(true)
  })
})
