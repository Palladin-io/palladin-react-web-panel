import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useSecurityUpgradeStore, type PendingSecurityUpgrade } from '../security-upgrade-store'
import type { UpgradeProgress, UpgradeStage } from '../use-security-upgrade-run'
import { SecurityUpgradeGate } from './security-upgrade-gate'

const runState = vi.hoisted(() => ({
  stage: 'messageKeys' as UpgradeStage,
  progress: { done: 0, total: null } as UpgradeProgress,
}))

vi.mock('../use-security-upgrade-run', () => ({
  useSecurityUpgradeRun: () => ({
    ...runState, setStage: vi.fn(), failure: null, running: true, kit: null, run: vi.fn(), finish: vi.fn(),
  }),
}))

const resume: PendingSecurityUpgrade = { kind: 'resume', legacyPrivateKey: new Uint8Array(32), legacyMemberKeyVersion: 1 }

function renderGate(pending: PendingSecurityUpgrade, stage: UpgradeStage, progress: UpgradeProgress) {
  runState.stage = stage
  runState.progress = progress
  useSecurityUpgradeStore.setState({ pending })
  render(<SecurityUpgradeGate><p>app</p></SecurityUpgradeGate>)
}

function rowStatus(label: RegExp) {
  return screen.getByText(label).closest('li')!.lastElementChild
}

afterEach(() => useSecurityUpgradeStore.setState({ pending: null }))

it('shows the active Agents stage as in progress until its Vault count is known', () => {
  renderGate(resume, 'messageKeys', { done: 0, total: null })
  expect(rowStatus(/^vaults$/i)).toHaveTextContent(/^done$/i)
  expect(rowStatus(/^agents$/i)).toHaveTextContent(/^in progress$/i)
})

it('counts the Agents stage from its own progress once known', () => {
  renderGate(resume, 'messageKeys', { done: 1, total: 3 })
  expect(rowStatus(/^agents$/i)).toHaveTextContent('1 of 3')
})

it('shows no step dots for a resumed migration', () => {
  renderGate(resume, 'rewrap', { done: 0, total: 2 })
  expect(rowStatus(/^vaults$/i)).toHaveTextContent('0 of 2')
  expect(rowStatus(/^agents$/i)).toHaveTextContent(/^waiting$/i)
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
})
