import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PendingGrantsPanel } from './pending-grants-panel'

const grant = {
  id: 'g1',
  vaultId: 'v1',
  agentName: 'Deploy Bot',
  entryLabel: 'Gmail',
  createdAt: '2026-06-01T10:00:00Z',
}

vi.mock('../use-pending-grants', () => ({
  usePendingGrants: () => ({
    data: [grant],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))
vi.mock('../use-approve-grant', () => ({
  useApproveGrant: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../use-grant-approval-review', () => ({
  useGrantApprovalReview: () => ({ data: undefined, isPending: false, isError: false }),
}))
vi.mock('../use-deny-grant', () => ({
  useDenyGrant: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('./approve-grant-dialog', () => ({ ApproveGrantDialog: () => null }))
vi.mock('./deny-grant-dialog', () => ({ DenyGrantDialog: () => null }))
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, Link: ({ children }: { children: ReactNode }) => children }
})

describe('PendingGrantsPanel — carousel variant', () => {
  it('renders the view-all link and reuses the pending grant card', () => {
    render(<PendingGrantsPanel variant="carousel" viewAllTo="/inbox" />)
    // Display names are resolved only from decrypted local MemberSync state;
    // the untrusted server label is intentionally ignored in this unit setup.
    expect(screen.getByText('Deploy Bot')).toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.getByText('View all →')).toBeInTheDocument()
  })
})
