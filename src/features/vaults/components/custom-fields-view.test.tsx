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
})
