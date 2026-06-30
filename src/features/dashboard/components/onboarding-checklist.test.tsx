import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingChecklist } from './onboarding-checklist'

const captureMock = vi.fn()
vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: (...args: unknown[]) => captureMock(...args) },
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => vi.fn() }
})

const noop = () => {}

function renderChecklist(overrides: Partial<Parameters<typeof OnboardingChecklist>[0]> = {}) {
  const onDismiss = vi.fn()
  render(
    <OnboardingChecklist
      vaultDone={false}
      apiKeyDone={false}
      agentDone={false}
      mobileRegistered={false}
      mobileSkipped={false}
      onGetApp={noop}
      onSkipMobile={noop}
      onDismiss={onDismiss}
      {...overrides}
    />,
  )
  return { onDismiss }
}

describe('OnboardingChecklist', () => {
  beforeEach(() => {
    captureMock.mockReset()
  })

  it('renders all four setup steps', () => {
    renderChecklist()
    expect(screen.getByText('Add your first vault')).toBeInTheDocument()
    expect(screen.getByText('Add an API key')).toBeInTheDocument()
    expect(screen.getByText('Register an agent')).toBeInTheDocument()
    expect(screen.getByText('Get the mobile app')).toBeInTheDocument()
  })

  it('shows Get the app and Skip on the active mobile step', () => {
    renderChecklist({ vaultDone: true, apiKeyDone: true, agentDone: true })
    expect(screen.getByRole('button', { name: 'Get the app' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument()
  })

  it('fires onboarding-skipped analytics and dismisses on "Skip setup"', () => {
    const { onDismiss } = renderChecklist()
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }))
    expect(captureMock).toHaveBeenCalledWith('identity', 'onboarding-skipped')
    expect(onDismiss).toHaveBeenCalled()
  })
})
