import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GrantFieldSelectionFields } from './grant-field-selection'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const fields = [{ id: 'credential.password', label: 'Password' }]

describe('grant field menu in a scrolling dialog', () => {
  it('portals the list to the body and keeps selection interactive', () => {
    const onChange = vi.fn()
    const { container } = render(<GrantFieldSelectionFields fields={fields}
      value={{ mode: 'selected', fieldIds: [] }} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'grants.fields.choose' }))
    const menu = screen.getByRole('listbox')
    expect(menu.parentElement).toBe(document.body)
    expect(container.contains(menu)).toBe(false)
    expect(menu.style.position).toBe('fixed')
    expect(menu.style.maxHeight).not.toBe('')
    fireEvent.mouseDown(within(menu).getByRole('option'))
    fireEvent.click(within(menu).getByRole('option'))
    expect(onChange).toHaveBeenCalledWith({ mode: 'selected', fieldIds: ['credential.password'] })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'grants.fields.choose' }))
    fireEvent.scroll(window)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('removes the portal when the grant operation becomes disabled', () => {
    const props = { fields, value: { mode: 'selected' as const, fieldIds: [] }, onChange: vi.fn() }
    const { rerender } = render(<GrantFieldSelectionFields {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'grants.fields.choose' }))
    rerender(<GrantFieldSelectionFields {...props} disabled />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'grants.fields.choose' })).toBeDisabled()
  })
})
