import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { CustomField } from '../types'
import { CustomFieldsEditor } from './custom-fields-editor'

/** Controlled harness — mirrors how the create/edit surfaces own the state. */
function Harness({ initial = [] as CustomField[] }) {
  const [fields, setFields] = useState<CustomField[]>(initial)
  return (
    <>
      <CustomFieldsEditor fields={fields} onChange={setFields} />
      <output data-testid="count">{fields.length}</output>
      <output data-testid="dump">{JSON.stringify(fields)}</output>
    </>
  )
}

describe('CustomFieldsEditor', () => {
  it('renders an empty hint with no fields', () => {
    render(<Harness />)
    expect(screen.getByText(/add extra fields/i)).toBeInTheDocument()
  })

  it('adds a field, edits it, and reports it upward', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: /add field/i }))
    expect(screen.getByTestId('count')).toHaveTextContent('1')

    await user.type(screen.getByPlaceholderText(/recovery email/i), 'PIN')
    await user.type(screen.getByPlaceholderText(/^field value$/i), '1234')

    const dump = JSON.parse(screen.getByTestId('dump').textContent!)
    expect(dump[0]).toMatchObject({ label: 'PIN', type: 'text', value: '1234' })
  })

  it('switches a field to a TOTP setup when the type changes', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: /add field/i }))
    await user.selectOptions(screen.getByLabelText(/^type$/i), 'totp')

    // The TOTP setup input replaces the plain value input.
    expect(screen.getByLabelText(/otpauth/i)).toBeInTheDocument()
    const dump = JSON.parse(screen.getByTestId('dump').textContent!)
    expect(dump[0].type).toBe('totp')
    expect(dump[0].value).toMatchObject({ algorithm: 'SHA1', digits: 6, period: 30 })
  })

  it('removes a field', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[{ id: 'a', label: 'X', type: 'text', value: 'y' }]} />)

    expect(screen.getByTestId('count')).toHaveTextContent('1')
    await user.click(screen.getByRole('button', { name: /^remove$/i }))
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })
})
