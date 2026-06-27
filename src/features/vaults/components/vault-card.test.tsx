import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GRANT_MODE_GRANULAR, type VaultSummary } from '../types'
import { VaultCard } from './vault-card'

const baseVault: VaultSummary = {
  id: 'v1',
  name: 'Production Keys',
  description: null,
  icon: 'shield',
  color: '#EB4747',
  grantMode: GRANT_MODE_GRANULAR,
  createdAt: '2026-04-25T10:00:00Z',
  updatedAt: '2026-04-25T10:00:00Z',
  entryCount: 8,
  activeGrantCount: 3,
  memberCount: 1,
}

describe('VaultCard', () => {
  it('renders the vault name and entry count', () => {
    render(<VaultCard vault={baseVault} onClick={vi.fn()} />)
    expect(screen.getByText('Production Keys')).toBeInTheDocument()
    // The entry count appears once under the title; grants and the
    // relative-update line carry the remaining metadata.
    const entryMatches = screen.getAllByText(/8 entries/i)
    expect(entryMatches).toHaveLength(1)
  })

  it('renders the active grants count in the header', () => {
    render(<VaultCard vault={baseVault} onClick={vi.fn()} />)
    expect(screen.getByText(/3 active grants/i)).toBeInTheDocument()
  })

  it('invokes onClick when activated', async () => {
    const handler = vi.fn()
    render(<VaultCard vault={baseVault} onClick={handler} />)
    screen.getByRole('button').click()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('falls back to the default icon when none is set', () => {
    const vault: VaultSummary = { ...baseVault, icon: null }
    const { container } = render(<VaultCard vault={vault} onClick={vi.fn()} />)
    // Default icon glyph 'shield' shows as the text content of the .mi span.
    expect(container.querySelector('.mi')?.textContent).toBe('shield')
  })
})
