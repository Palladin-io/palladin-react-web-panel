import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GrantPolicyFields } from './grant-policy-fields'
import { POLICY_ERROR_KEY, type GrantPolicyKind } from '../grant-policy'

/**
 * Wrapper that owns the controlled state so the default-fill `useEffect` and the
 * chip clicks behave like in a real dialog. Exposes the latest expiresAt via a
 * spy so assertions can read what the component pushed up.
 */
function Harness({
  onExpiresAtSpy,
  initialKind = 'time',
}: {
  onExpiresAtSpy: (value: string) => void
  initialKind?: GrantPolicyKind
}) {
  const [kind, setKind] = useState<GrantPolicyKind>(initialKind)
  const [expiresAt, setExpiresAt] = useState('')
  const [queryLimit, setQueryLimit] = useState('')
  return (
    <GrantPolicyFields
      kind={kind}
      expiresAt={expiresAt}
      queryLimit={queryLimit}
      error={null}
      disabled={false}
      idPrefix="t"
      onKindChange={setKind}
      onExpiresAtChange={(v) => {
        setExpiresAt(v)
        onExpiresAtSpy(v)
      }}
      onQueryLimitChange={setQueryLimit}
    />
  )
}

describe('GrantPolicyFields — time mode', () => {
  it('defaults to a future expiry (~1 day) on entering time mode', () => {
    const spy = vi.fn()
    render(<Harness onExpiresAtSpy={spy} />)
    // The default-fill effect pushes one value up; it must be in the future.
    expect(spy).toHaveBeenCalledTimes(1)
    expect(new Date(spy.mock.calls[0][0]).getTime()).toBeGreaterThan(Date.now())
    expect(screen.getByRole('button', { name: '24h' })).toHaveAttribute('aria-pressed', 'true')
    // Summary shows the relative distance ("in 23 hours" / "in 1 day").
    expect(screen.getByText(/Expires in \d+ (hour|day)/i)).toBeInTheDocument()
  })

  it('a quick-hours chip sets a future expiry', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Harness onExpiresAtSpy={spy} />)
    spy.mockClear()
    await user.click(screen.getByRole('button', { name: '2h' }))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(new Date(spy.mock.calls[0][0]).getTime()).toBeGreaterThan(Date.now())
    expect(screen.getByRole('button', { name: '2h' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '24h' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('a quick-minutes chip sets a future expiry', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Harness onExpiresAtSpy={spy} />)
    spy.mockClear()
    await user.click(screen.getByRole('button', { name: '30min' }))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(new Date(spy.mock.calls[0][0]).getTime()).toBeGreaterThan(Date.now())
    expect(screen.getByRole('button', { name: '30min' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Custom opens the date-time picker popover', async () => {
    const user = userEvent.setup()
    render(<Harness onExpiresAtSpy={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /custom/i }))
    expect(screen.getByRole('button', { name: /custom/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '24h' })).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByRole('dialog', { name: /choose date and time/i }),
    ).toBeInTheDocument()
  })

  it('shows the expiry error when the parent reports one', () => {
    render(
      <GrantPolicyFields
        kind="time"
        expiresAt=""
        queryLimit=""
        error={POLICY_ERROR_KEY.expiryRequired}
        disabled={false}
        idPrefix="t"
        onKindChange={vi.fn()}
        onExpiresAtChange={vi.fn()}
        onQueryLimitChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/choose an expiry/i)
  })
})
