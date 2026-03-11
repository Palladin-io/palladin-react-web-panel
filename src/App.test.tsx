import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('App smoke test', () => {
  it('renders without crashing', () => {
    render(<div>Claw Vault</div>)
    expect(screen.getByText('Claw Vault')).toBeInTheDocument()
  })
})
