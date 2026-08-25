import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./script-grant-summary', () => ({
  ScriptGrantSummary: ({ onStatusChange }: { onStatusChange: (revision: string) => void }) => {
    return <button type="button" onClick={() => onStatusChange('9')}>Review current Script scope</button>
  },
}))

import type { OrgGrant } from '../api/org-grants-api'
import { GrantAgainDialog } from './grant-again-dialog'

describe('GrantAgainDialog', () => {
  it('passes the current reviewed Script revision into regrant confirmation', async () => {
    const onConfirm = vi.fn()
    const grant = {
      id: 'grant-1',
      vaultId: 'vault-1',
      agentId: 'agent-1',
      agentName: 'Deploy Bot',
      entryId: 'script-1',
      entryLabel: 'Deployment report',
      type: 'scriptExecution',
      scriptScopes: [],
    } as unknown as OrgGrant
    render(<GrantAgainDialog grant={grant} isPending={false} onConfirm={onConfirm} onCancel={vi.fn()} />)

    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Review current Script scope' }))
    await user.click(screen.getByRole('button', { name: 'Grant access' }))

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: expect.any(String) }), '9')
  })
})
