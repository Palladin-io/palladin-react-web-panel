import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DetailTabBar } from './detail-tab-bar'

describe('DetailTabBar', () => {
  it('marks the active tab and changes to an enabled tab', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <DetailTabBar
        tabs={[
          { id: 'general', label: 'General' },
          { id: 'permissions', label: 'Permissions' },
        ]}
        active="general"
        onChange={onChange}
        ariaLabel="Role sections"
        wide
      />,
    )

    expect(screen.getByRole('tablist', { name: 'Role sections' })).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Role sections' })).toHaveClass('tab-strip-scroll')
    expect(screen.getAllByRole('tab').every((tab) => tab.classList.contains('font-semibold'))).toBe(true)
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('tab', { name: 'Permissions' }))
    expect(onChange).toHaveBeenCalledWith('permissions')
  })

  it('keeps narrow navigation on the same fixed-height row as the tabs', () => {
    render(
      <DetailTabBar
        tabs={[{ id: 'general', label: 'General' }]}
        active="general"
        onChange={vi.fn()}
        ariaLabel="Role sections"
        leading={<button type="button">Back</button>}
      />,
    )

    const back = screen.getByRole('button', { name: 'Back' })
    const row = back.parentElement?.parentElement
    expect(row).toHaveClass('h-10', 'items-end', 'border-b')
    expect(row).toContainElement(screen.getByRole('tablist', { name: 'Role sections' }))
  })
})
