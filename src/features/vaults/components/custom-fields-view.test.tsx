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
})
