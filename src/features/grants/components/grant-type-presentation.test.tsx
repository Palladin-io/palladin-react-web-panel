import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Grant } from '../api/grants-api'
import { GrantDetail } from './grant-detail'
import { GrantListPanel } from './grant-list-panel'

const state = vi.hoisted(() => ({ items: [] as Grant[] }))
vi.mock('../use-vault-grants', () => ({ useVaultGrants: () => ({ data: { items: state.items }, isPending: false, isError: false }) }))
vi.mock('../use-revoke-grant', () => ({ useRevokeGrant: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: ReactNode }) => <a>{children}</a> }))

describe('grant type presentation', () => {
  it.each([['scriptExecution', 'Script execution'], ['future', 'Unknown type']])('keeps %s distinct from granular in both management surfaces', (type, label) => {
    const grant: Grant = {
      grantId: 'g1', vaultId: 'v1', type, status: 'expired', agentId: 'a1', agentName: 'Agent', entryId: 'e1',
      entryLabel: 'Target', expiresAt: null, queryLimit: null, queryCount: 0, createdAt: '2026-09-01T00:00:00Z',
      createdByName: null, revokedAt: null, revokedByName: null,
    }
    state.items = [grant]
    render(<><GrantDetail grant={grant} /><GrantListPanel vaultId="v1" /></>)
    expect(screen.getAllByText(new RegExp(label))).toHaveLength(2)
    expect(screen.queryByText(/Single entry/)).not.toBeInTheDocument()
  })
})
