import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { YourVaultsCard } from './your-vaults-card'

const state = vi.hoisted(() => ({
  vaults: { data: { vaults: [] as { id: string; name: string }[] } },
}))

vi.mock('../../vaults', () => ({
  useVaults: () => state.vaults,
  // Reused canonical card — stubbed to its visible name for the unit.
  VaultCard: ({ vault }: { vault: { name: string } }) => <div>{vault.name}</div>,
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({ children }: { children: ReactNode }) => children,
  }
})

describe('YourVaultsCard', () => {
  beforeEach(() => {
    state.vaults = { data: { vaults: [] } }
  })

  it('lists up to the first few vaults', () => {
    state.vaults = {
      data: { vaults: [{ id: 'v1', name: 'Production' }, { id: 'v2', name: 'Personal' }] },
    }
    render(<YourVaultsCard />)
    expect(screen.getByText('Your vaults')).toBeInTheDocument()
    expect(screen.getByText('Production')).toBeInTheDocument()
    expect(screen.getByText('Personal')).toBeInTheDocument()
  })

  it('shows an empty hint when there are no vaults', () => {
    render(<YourVaultsCard />)
    expect(screen.getByText('No vaults yet')).toBeInTheDocument()
  })
})
