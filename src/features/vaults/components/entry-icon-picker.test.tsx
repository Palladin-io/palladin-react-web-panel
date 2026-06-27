import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EntryIconPicker } from './entry-icon-picker'

describe('EntryIconPicker', () => {
  // A freshly created entry can have a null icon coming from the API; the
  // picker must treat null like "no icon", not feed it into `.replace`.
  it('renders without crashing when value is null', () => {
    expect(() =>
      render(
        <EntryIconPicker
          value={null as unknown as undefined}
          onChange={vi.fn()}
          selectedColor="#EB4747"
        />,
      ),
    ).not.toThrow()
  })

  it('renders without crashing when value is undefined', () => {
    expect(() =>
      render(<EntryIconPicker value={undefined} onChange={vi.fn()} selectedColor="#EB4747" />),
    ).not.toThrow()
  })
})
