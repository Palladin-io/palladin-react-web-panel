import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VaultDetailTabs } from './vault-detail-tabs'

describe('VaultDetailTabs', () => {
  it('renders all five tab labels', () => {
    render(<VaultDetailTabs active="entries" onChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Entries' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Agents' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Audit Log' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Members' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument()
  })

  it('marks the active tab with aria-selected', () => {
    render(<VaultDetailTabs active="agents" onChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Agents' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Entries' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('emits the new tab id when a tab is clicked', () => {
    const handler = vi.fn()
    render(<VaultDetailTabs active="entries" onChange={handler} />)
    screen.getByRole('tab', { name: 'Settings' }).click()
    expect(handler).toHaveBeenCalledWith('settings')
  })
})
