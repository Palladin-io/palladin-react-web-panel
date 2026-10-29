import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CustomFieldsView } from './custom-fields-view'

describe('CustomFieldsView', () => {
  it('renders an unknown future field as a concealed serialized fallback', () => {
    render(<CustomFieldsView fields={[{
      id: 'field-future',
      label: 'Future config',
      type: 'future-json',
      value: { region: 'eu', retries: 3 } as never,
    }]} />)

    expect(screen.getByText('Future config')).toBeInTheDocument()
    expect(screen.queryByText('{"region":"eu","retries":3}')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /reveal/i }))

    expect(screen.getByText('{"region":"eu","retries":3}')).toBeInTheDocument()
  })

  it('falls back instead of treating unknown TOTP JSON as a live code', () => {
    render(<CustomFieldsView fields={[{
      id: 'field-future-totp',
      label: 'Future TOTP',
      type: 'totp',
      value: { seed: 'new-format', revision: 2 } as never,
    }]} />)

    expect(screen.queryByLabelText(/current code/i)).not.toBeInTheDocument()
    expect(screen.queryByText('{"seed":"new-format","revision":2}')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /reveal/i }))

    expect(screen.getByText('{"seed":"new-format","revision":2}')).toBeInTheDocument()
  })

  it('renders one recognized Credential sign-in method readably', () => {
    render(<CustomFieldsView signInMethod fields={[{
      id: 'sign-in',
      label: 'Sign-in method',
      type: 'palladin.signin.v1',
      value: { provider: 'github', account: null } as never,
    }]} />)

    expect(screen.getByText('Sign-in method')).toBeInTheDocument()
    expect(screen.getByText(/GitHub/)).toBeInTheDocument()
    expect(screen.getByText('Account not specified')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reveal/i })).not.toBeInTheDocument()
  })

  it.each([
    ['unrecognized', [{ id: 'a', label: 'Sign-in method', type: 'palladin.signin.v1',
      value: { provider: 'github', account: null, extra: 1 } as never }]],
    ['ambiguous', [
      { id: 'a', label: 'Sign-in A', type: 'palladin.signin.v1', value: { provider: 'github', account: null } as never },
      { id: 'b', label: 'Sign-in B', type: 'palladin.signin.v1', value: { provider: 'apple', account: null } as never },
    ]],
  ])('keeps the concealed fallback for an %s sign-in method', (_, fields) => {
    render(<CustomFieldsView signInMethod fields={fields} />)
    expect(screen.queryByText(/GitHub/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /reveal/i })).toHaveLength(fields.length)
  })

  it('does not interpret a sign-in method outside a Credential', () => {
    render(<CustomFieldsView fields={[{
      id: 'sign-in', label: 'Sign-in method', type: 'palladin.signin.v1',
      value: { provider: 'github', account: 'octocat' } as never,
    }]} />)
    expect(screen.queryByText(/GitHub/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reveal/i })).toBeInTheDocument()
  })
})
