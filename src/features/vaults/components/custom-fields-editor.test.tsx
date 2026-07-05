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

/** Open the "+ Add field" menu and pick a type. */
async function addField(user: ReturnType<typeof userEvent.setup>, type: RegExp) {
  await user.click(screen.getByRole('button', { name: /add field/i }))
  await user.click(screen.getByRole('menuitem', { name: type }))
}

describe('CustomFieldsEditor', () => {
  it('shows the add-field trigger and no rows initially', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: /add field/i })).toBeInTheDocument()
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  it('adds a Text field via the type menu, edits it, and reports upward', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await addField(user, /^text$/i)
    expect(screen.getByTestId('count')).toHaveTextContent('1')

    await user.type(screen.getByPlaceholderText(/recovery email/i), 'PIN')
    await user.type(screen.getByPlaceholderText(/^field value$/i), '1234')

    const dump = JSON.parse(screen.getByTestId('dump').textContent!)
    expect(dump[0]).toMatchObject({ label: 'PIN', type: 'text', value: '1234' })
  })

  it('keeps the field id stable when the type changes', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await addField(user, /^text$/i)
    const idBefore = JSON.parse(screen.getByTestId('dump').textContent!)[0].id

    // The row type control opens the same menu; switch to TOTP.
    await user.click(screen.getByRole('button', { name: /^type$/i }))
    await user.click(screen.getByRole('menuitem', { name: /one-time code/i }))

    const field = JSON.parse(screen.getByTestId('dump').textContent!)[0]
    expect(field.id).toBe(idBefore)
    expect(field.type).toBe('totp')
    expect(field.value).toMatchObject({ algorithm: 'SHA1', digits: 6, period: 30 })
    expect(screen.getByLabelText(/otpauth/i)).toBeInTheDocument()
  })

  it('flags a value without a label', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await addField(user, /^text$/i)
    await user.type(screen.getByPlaceholderText(/^field value$/i), 'orphan')

    expect(screen.getByText(/add a label for this field/i)).toBeInTheDocument()
  })

  it('flags duplicate labels', () => {
    render(
      <Harness
        initial={[
          { id: 'a', label: 'Note', type: 'text', value: '1' },
          { id: 'b', label: 'note', type: 'text', value: '2' },
        ]}
      />,
    )
    expect(screen.getAllByText(/must be unique/i).length).toBeGreaterThan(0)
  })

  it('removes a field', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[{ id: 'a', label: 'X', type: 'text', value: 'y' }]} />)

    expect(screen.getByTestId('count')).toHaveTextContent('1')
    await user.click(screen.getByRole('button', { name: /^remove$/i }))
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })
})
