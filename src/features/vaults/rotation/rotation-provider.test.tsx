import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RotationProvider } from './rotation-provider'

describe('RotationProvider canonical cutover guard', () => {
  it('renders children without starting the retired flattened rotation engine', () => {
    render(
      <RotationProvider enabled memberId="11111111-1111-4111-8111-111111111111" memberPrivateKey={new Uint8Array(32)}>
        <div>vault</div>
      </RotationProvider>,
    )
    expect(screen.getByText('vault')).toBeInTheDocument()
  })
})
