import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cryptoMocks = vi.hoisted(() => ({
  getEntry: vi.fn(),
  getVault: vi.fn(),
  openVaultKey: vi.fn(async () => new Uint8Array(32)),
  openSecret: vi.fn(),
  wipe: vi.fn(),
}))

vi.mock('../../vaults/api/vault-api', () => ({ getCanonicalEntry: cryptoMocks.getEntry }))
vi.mock('../../vaults/sync/member-sync-api', () => ({ getEncryptedVault: cryptoMocks.getVault }))
vi.mock('../../../shared/crypto/vault-protocol', () => ({ openMemberVaultKey: cryptoMocks.openVaultKey }))
vi.mock('../../../shared/crypto/entry-protocol', () => ({ openMemberSecret: cryptoMocks.openSecret }))
vi.mock('../../../shared/crypto/sodium', () => ({ wipe: cryptoMocks.wipe }))

import { useAuthStore } from '../../auth'
import { ScriptGrantSummary } from './script-grant-summary'

describe('ScriptGrantSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ privateKey: new Uint8Array(32).fill(4) })
    cryptoMocks.getVault.mockResolvedValue({ memberVaultKey: {} })
    cryptoMocks.getEntry.mockImplementation(async (_vaultId: string, entryId: string) => {
      if (entryId === 'broken') throw new Error('unavailable')
      return {
        organizationId: '11111111-1111-4111-8111-111111111111',
        currentRevision: '9',
        entryKey: {},
        memberSecret: {},
      }
    })
    cryptoMocks.openSecret.mockResolvedValue({
      entryType: 'script',
      content: {
        refs: [{
          env: 'TOKEN',
          entryId: '33333333-3333-4333-8333-333333333333',
          fieldId: 'credential.password',
        }],
        execution: {
          contractVersion: 1,
          description: 'Current reviewed scope',
          parameters: [],
          returnResultToAgent: true,
        },
      },
    })
  })

  it('clears an earlier unavailable state when a different Script loads successfully', async () => {
    const onStatusChange = vi.fn()
    const view = render(
      <ScriptGrantSummary vaultId="v1" scriptEntryId="broken" onStatusChange={onStatusChange} />,
    )
    expect(await screen.findByText('Script is not ready for access')).toBeInTheDocument()

    view.rerender(
      <ScriptGrantSummary vaultId="v1" scriptEntryId="current" onStatusChange={onStatusChange} />,
    )

    expect(await screen.findByText('Current reviewed scope')).toBeInTheDocument()
    expect(screen.queryByText('Script is not ready for access')).not.toBeInTheDocument()
    expect(screen.getByText(/credential\.password/)).toBeInTheDocument()
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith('9'))
  })
})
