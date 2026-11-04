import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { CustomField } from '../types'
import { CustomFieldsEditor } from './custom-fields-editor'

/** Controlled harness — mirrors how the create/edit surfaces own the state. */
function Harness({ initial = [] as CustomField[], hideSignInMethod = false }) {
  const [fields, setFields] = useState<CustomField[]>(initial)
  return (
    <>
      <CustomFieldsEditor fields={fields} onChange={setFields} copyable hideSignInMethod={hideSignInMethod} />
      <output data-testid="count">{fields.length}</output>
      <output data-testid="dump">{JSON.stringify(fields)}</output>
    </>
  )
}

type User = ReturnType<typeof userEvent.setup>

/** Open the "+ Add field" menu and pick a type by its menu-item name. */
async function addField(user: User, type: RegExp) {
  await user.click(screen.getByRole('button', { name: /add field/i }))
  await user.click(screen.getByRole('menuitem', { name: type }))
}

const dump = () => JSON.parse(screen.getByTestId('dump').textContent!)

describe('CustomFieldsEditor', () => {
  it('shows the add-field ghost row with visible text and no rows initially', () => {
    render(<Harness />)
    const add = screen.getByRole('button', { name: /add field/i })
    // The ghost row must render its label (regression: it once collapsed empty).
    expect(add).toHaveTextContent(/add field/i)
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  it('opens the type menu on the add trigger', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: /add field/i }))
    // All four type options appear (the menu is portaled, but present in the DOM).
    expect(screen.getByRole('menuitem', { name: /^text/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /multiline/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /hidden/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /one-time password/i })).toBeInTheDocument()
  })

  it('adds a Text field via the type menu, edits it, and reports upward', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await addField(user, /^text/i)
    expect(screen.getByTestId('count')).toHaveTextContent('1')

    await user.type(screen.getByLabelText(/field label/i), 'Account ID')
    await user.type(screen.getByLabelText(/^value$/i), '1234')

    expect(dump()[0]).toMatchObject({ label: 'Account ID', type: 'text', value: '1234' })
  })

  it('adds a Multiline field', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await addField(user, /multiline/i)
    expect(dump()[0].type).toBe('multiline')
  })

  it('keeps the field id stable when the type changes', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await addField(user, /^text/i)
    const idBefore = dump()[0].id

    // The row type control opens the same menu; switch to one-time password.
    await user.click(screen.getByRole('button', { name: /^type$/i }))
    await user.click(screen.getByRole('menuitem', { name: /one-time password/i }))

    const field = dump()[0]
    expect(field.id).toBe(idBefore)
    expect(field.type).toBe('totp')
    expect(screen.getByLabelText(/otpauth/i)).toBeInTheDocument()
  })

  it('toggles agent visibility from the ⋯ menu (text only) and drops it on secret types', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await addField(user, /^text/i)
    await user.click(screen.getByRole('button', { name: /more actions/i }))
    await user.click(screen.getByRole('menuitem', { name: /visible to agents/i }))
    expect(dump()[0].agentVisible).toBe(true)

    // Switching to a secret type must strip agentVisible.
    await user.click(screen.getByRole('button', { name: /^type$/i }))
    await user.click(screen.getByRole('menuitem', { name: /hidden/i }))
    expect(dump()[0].agentVisible).toBeUndefined()
  })

  it('flags a value without a label', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await addField(user, /^text/i)
    await user.type(screen.getByLabelText(/^value$/i), 'orphan')

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

  it('removes a field from the ⋯ menu', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[{ id: 'a', label: 'X', type: 'text', value: 'y' }]} />)

    expect(screen.getByTestId('count')).toHaveTextContent('1')
    await user.click(screen.getByRole('button', { name: /more actions/i }))
    await user.click(screen.getByRole('menuitem', { name: /^remove$/i }))
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  it('reorders fields by dragging the grip', () => {
    const onChange = vi.fn()
    const fields = [
      { id: 'f1', type: 'text' as const, label: 'Alpha', value: 'a' },
      { id: 'f2', type: 'text' as const, label: 'Beta', value: 'b' },
    ]
    render(<CustomFieldsEditor fields={fields} onChange={onChange} />)

    // i18n init differs per test-run shape — match the translated label or the raw key.
    const grips = screen.getAllByLabelText(/drag to reorder|dragToReorder/i)
    fireEvent.dragStart(grips[0], { dataTransfer: { effectAllowed: '' } })
    // dragOver bubbles from the second row's label input up to the row wrapper.
    fireEvent.dragOver(screen.getByDisplayValue('Beta'))

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'f2' }),
      expect.objectContaining({ id: 'f1' }),
    ])
  })

  it('shows an unknown field type read-only and preserves its value exactly', async () => {
    const user = userEvent.setup()
    const future: CustomField = { id: 'future', label: 'Future', type: 'future-json',
      value: { nested: [1, ' x '] } as never }
    render(<Harness initial={[future]} />)

    expect(screen.getByText('Unsupported field, kept unchanged')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /value/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^type$/i })).not.toBeInTheDocument()

    await addField(user, /^text/i)
    expect(dump()[0]).toEqual(future)

    await user.click(screen.getAllByRole('button', { name: /more actions/i })[0])
    await user.click(screen.getByRole('menuitem', { name: /remove/i }))
    expect(dump()).toHaveLength(1)
    expect(dump()[0].type).toBe('text')
  })

  it('hides Credential sign-in methods while keeping them in place', async () => {
    const user = userEvent.setup()
    const signIn: CustomField = { id: 'sign-in', label: 'Sign-in method', type: 'palladin.signin.v1',
      value: { provider: 'google', account: null } as never }
    const first: CustomField = { id: 'first', label: 'First', type: 'text', value: 'one' }
    const last: CustomField = { id: 'last', label: 'Last', type: 'text', value: 'two' }
    render(<Harness initial={[first, signIn, last]} hideSignInMethod />)

    expect(screen.queryByText('Sign-in method')).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: /more actions/i })[0])
    await user.click(screen.getByRole('menuitem', { name: /remove/i }))

    expect(dump()).toEqual([last, signIn])
  })
})
