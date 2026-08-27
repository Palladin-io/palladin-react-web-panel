import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GRANT_TYPE_FULL, GRANT_TYPE_GRANULAR, type OrgGrant } from '../api/org-grants-api'
import { GrantAgainDialog } from './grant-again-dialog'

const grant = {
  id: 'grant-1',
  vaultId: 'vault-1',
  vaultName: 'Production Vault',
  agentId: 'agent-1',
  agentName: 'Deploy Agent',
  type: GRANT_TYPE_GRANULAR,
  status: 'expired',
  entryId: 'entry-1',
  entryLabel: 'Deploy token',
  createdAt: '2026-08-25T00:00:00Z',
} as OrgGrant

function renderDialog(value: OrgGrant) {
  render(
    <GrantAgainDialog
      grant={value}
      isPending={false}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
}

describe('GrantAgainDialog resource label', () => {
  it('names the Vault for a FULL grant', () => {
    renderDialog({ ...grant, type: GRANT_TYPE_FULL, entryId: null, entryLabel: null })

    expect(screen.getByText('Production Vault')).toBeInTheDocument()
    expect(screen.queryByText('Deploy token')).not.toBeInTheDocument()
    expect(screen.queryByText(/cryptographic access to every current and future entry/i)).not.toBeInTheDocument()
  })

  it('names the Entry for a GRANULAR grant', () => {
    renderDialog(grant)

    expect(screen.getByText('Deploy token')).toBeInTheDocument()
    expect(screen.queryByText('Production Vault')).not.toBeInTheDocument()
  })
})
