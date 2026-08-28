import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ENTRY_TYPE_CREDENTIAL } from '../types'
import { EntryAgentsTab } from './entry-agents-tab'

vi.mock('../../grants', () => ({
  OrgGrantsPanel: ({ entryId }: { entryId: string }) => (
    <div data-testid="grants" data-entry-id={entryId} />
  ),
}))

describe('EntryAgentsTab', () => {
  it('contains only scoped grants because Discovery visibility is edited beside fields', () => {
    render(<EntryAgentsTab vaultId="vault" entryId="entry" entryType={ENTRY_TYPE_CREDENTIAL}
      memberLabel="GitHub private" detail={{} as never} />)

    expect(screen.getByTestId('grants')).toHaveAttribute('data-entry-id', 'entry')
    expect(screen.queryByText('Scoped grants for GitHub private')).not.toBeInTheDocument()
    expect(screen.queryByText(/visibility policy/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^reveal$/i })).not.toBeInTheDocument()
  })
})
