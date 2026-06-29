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
      notificationsDone={false}
      vaultDone={false}
      apiKeyDone={false}
      agentDone={false}
      onEnableNotifications={noop}
      onSkipNotifications={noop}
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
    expect(screen.getByText('Enable notifications')).toBeInTheDocument()
    expect(screen.getByText('Add your first vault')).toBeInTheDocument()
    expect(screen.getByText('Add an API key')).toBeInTheDocument()
    expect(screen.getByText('Register an agent')).toBeInTheDocument()
  })

  it('shows Enable and Skip on the active notifications step', () => {
    renderChecklist()
    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument()
  })

  it('fires onboarding-skipped analytics and dismisses on "Skip setup"', () => {
    const { onDismiss } = renderChecklist()
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }))
    expect(captureMock).toHaveBeenCalledWith('identity', 'onboarding-skipped')
    expect(onDismiss).toHaveBeenCalled()
  })
})
