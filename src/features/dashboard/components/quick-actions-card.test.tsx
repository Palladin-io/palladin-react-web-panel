import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QuickActionsCard } from './quick-actions-card'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigateMock }
})

describe('QuickActionsCard', () => {
  it('renders a shortcut for each core resource', () => {
    render(<QuickActionsCard />)
    expect(screen.getByRole('button', { name: /add vault/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add API key/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /register agent/i })).toBeInTheDocument()
  })

  it('navigates to the matching create flow on click', () => {
    render(<QuickActionsCard />)
    fireEvent.click(screen.getByRole('button', { name: /add vault/i }))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/vaults' })
  })
})
