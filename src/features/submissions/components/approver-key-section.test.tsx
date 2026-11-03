import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ canReview: true, presentation: 'ready' as string }))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../use-approver-keys', () => ({
  useCanReviewSubmissions: () => mocks.canReview,
  useApproverKeyPresentation: () => mocks.presentation,
  useRebootstrapApproverKeys: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { ApproverKeySection } from './approver-key-section'

beforeEach(() => {
  mocks.canReview = true
})

describe('ApproverKeySection', () => {
  it.each([
    ['ready', 'Ready. You can review agent submissions.'],
    ['settingUp', 'Preparing the review key…'],
    ['waiting', /Waiting for another reviewer/],
    ['error', 'The review key status is unavailable. Try again later.'],
  ])('reports the %s state without asking for action', (presentation, text) => {
    mocks.presentation = presentation
    render(<ApproverKeySection />)
    expect(screen.getByRole('status')).toHaveTextContent(text)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('requires an explicit re-bootstrap with a re-trust warning when no reviewer can open the key', () => {
    mocks.presentation = 'unavailable'
    render(<ApproverKeySection />)
    expect(screen.getByRole('alert')).toHaveTextContent(/explicitly trust the new key/)
    expect(screen.getByRole('button', { name: 'Create new review key' })).toBeEnabled()
  })

  it('is hidden for members who cannot manage access', () => {
    mocks.canReview = false
    const { container } = render(<ApproverKeySection />)
    expect(container).toBeEmptyDOMElement()
  })
})
