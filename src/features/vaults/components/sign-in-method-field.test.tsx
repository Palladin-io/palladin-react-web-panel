import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { CustomField } from '../types'
import { SignInMethodField } from './sign-in-method-field'

function Harness({ initial = [] as CustomField[] }) {
  const [fields, setFields] = useState<CustomField[]>(initial)
  return (
    <>
      <SignInMethodField fields={fields} onChange={setFields} />
      <output data-testid="dump">{JSON.stringify(fields)}</output>
    </>
  )
}

const dump = (): CustomField[] => JSON.parse(screen.getByTestId('dump').textContent!)
const other: CustomField = { id: 'other', label: 'Recovery', type: 'text', value: 'abc' }

function binding(id: string, value: unknown): CustomField {
  return { id, label: 'Sign-in method', type: 'palladin.signin.v1', value: value as CustomField['value'] }
}

describe('SignInMethodField', () => {
  it('renders the empty prompt without creating a field', () => {
    render(<Harness initial={[other]} />)
    expect(screen.getByText('Sign in with Google, Apple or another provider?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add sign-in method' })).toBeInTheDocument()
    expect(dump()).toEqual([other])
  })

  it('adds a binding after an explicit provider choice and stores a trimmed account', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[other]} />)

    await user.click(screen.getByRole('button', { name: 'Add sign-in method' }))
    expect(dump()).toEqual([other])
    await user.selectOptions(screen.getByLabelText('Provider'), 'apple')

    const added = dump()[1]
    expect(added).toMatchObject({ label: 'Sign-in method', type: 'palladin.signin.v1',
      value: { provider: 'apple', account: null } })
    expect(added.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)

    await user.type(screen.getByLabelText('Provider account'), '  me@icloud.com ')
    expect(screen.getByLabelText('Provider account')).toHaveValue('  me@icloud.com ')
    expect(dump()[1]).toEqual({ ...added, value: { provider: 'apple', account: 'me@icloud.com' } })

    await user.clear(screen.getByLabelText('Provider account'))
    expect(dump()[1].value).toEqual({ provider: 'apple', account: null })
  })

  it('edits provider in place and removes the binding', async () => {
    const user = userEvent.setup()
    const existing = binding('keep', { provider: 'google', account: 'alice@example.com' })
    render(<Harness initial={[existing, other]} />)

    expect(screen.getByLabelText('Provider account')).toHaveValue('alice@example.com')
    await user.selectOptions(screen.getByLabelText('Provider'), 'microsoft')
    expect(dump()).toEqual([{ ...existing, value: { provider: 'microsoft', account: 'alice@example.com' } }, other])

    await user.click(screen.getByRole('button', { name: 'Remove sign-in method' }))
    expect(dump()).toEqual([other])
  })

  it('never decodes an unrecognized binding and replaces it only on an explicit choice', async () => {
    const user = userEvent.setup()
    const unknown = binding('odd', { provider: 'google', account: ' padded ' })
    render(<Harness initial={[unknown, other]} />)

    expect(screen.getByText(/does not recognize/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Provider account')).not.toBeInTheDocument()
    expect(dump()).toEqual([unknown, other])

    await user.click(screen.getByRole('button', { name: 'Replace' }))
    expect(dump()).toEqual([unknown, other])
    await user.selectOptions(screen.getByLabelText('Provider'), 'google')

    const next = dump()
    expect(next).toHaveLength(2)
    expect(next[0].id).not.toBe('odd')
    expect(next[0].value).toEqual({ provider: 'google', account: null })
    expect(next[1]).toEqual(other)
  })

  it('collapses ambiguous bindings to one on replace, or removes all of them', async () => {
    const user = userEvent.setup()
    const fields = [
      binding('a', { provider: 'google', account: 'x' }),
      other,
      binding('b', { provider: 'apple', account: null }),
    ]
    const { unmount } = render(<Harness initial={fields} />)
    expect(screen.getByText(/more than one saved sign-in method/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Replace' }))
    await user.selectOptions(screen.getByLabelText('Provider'), 'facebook')
    expect(dump().filter((field) => field.type === 'palladin.signin.v1')).toHaveLength(1)
    unmount()

    render(<Harness initial={fields} />)
    await user.click(screen.getByRole('button', { name: 'Remove sign-in method' }))
    expect(dump()).toEqual([other])
  })
})
