import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GRANT_MODE_GRANULAR, type VaultSummary } from '../types'
import { VaultCard } from './vault-card'

const baseVault: VaultSummary = {
  id: 'v1',
  name: 'Production Keys',
  description: null,
  icon: 'shield',
  color: '#FF4F4F',
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
    expect(screen.getByText('8 entries')).toBeInTheDocument()
  })

  it('renders the active grants count in both header and footer slots', () => {
    render(<VaultCard vault={baseVault} onClick={vi.fn()} />)
    // The grants count appears twice — once on the header right side
    // and once in the footer next to the lock icon.
    const matches = screen.getAllByText(/3 active grants/i)
    expect(matches).toHaveLength(2)
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
