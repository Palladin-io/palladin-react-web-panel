import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  GRANT_TYPE_FULL,
  GRANT_TYPE_GRANULAR,
  type OrgGrant,
} from '../api/org-grants-api'
import { GrantAgainDialog } from './grant-again-dialog'

vi.mock('./script-grant-summary', () => ({
  ScriptGrantSummary: ({ onStatusChange }: { onStatusChange: (revision: string) => void }) => (
    <button type="button" onClick={() => onStatusChange('9')}>Review current Script scope</button>
  ),
}))

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

function renderDialog(value: OrgGrant, onConfirm = vi.fn()) {
  render(
    <GrantAgainDialog
      grant={value}
      isPending={false}
      onConfirm={onConfirm}
      onCancel={vi.fn()}
    />,
  )
}

describe('GrantAgainDialog', () => {
  it('names the Vault for a FULL grant', () => {
    renderDialog({ ...grant, type: GRANT_TYPE_FULL, entryId: null, entryLabel: null })

    expect(screen.getByText('Production Vault')).toBeInTheDocument()
    expect(screen.queryByText('Deploy token')).not.toBeInTheDocument()
  })

  it('names the Entry for a GRANULAR grant', () => {
    renderDialog(grant)

    expect(screen.getByText('Deploy token')).toBeInTheDocument()
    expect(screen.queryByText('Production Vault')).not.toBeInTheDocument()
  })

  it('passes the current reviewed Script revision into regrant confirmation', async () => {
    const onConfirm = vi.fn()
    renderDialog({
      ...grant,
      agentName: 'Deploy Bot',
      entryId: 'script-1',
      entryLabel: 'Deployment report',
      type: 'scriptExecution',
      scriptScopes: [],
    } as OrgGrant, onConfirm)

    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Review current Script scope' }))
    await user.click(screen.getByRole('button', { name: 'Grant access' }))

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: expect.any(String) }),
      '9',
    )
  })
})
