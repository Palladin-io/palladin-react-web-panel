import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { SectionHeader } from './section-header'

describe('SectionHeader', () => {
  it('moves optional guidance into an accessible info tooltip', async () => {
    const user = userEvent.setup()
    render(
      <SectionHeader hint="Values are supplied when the Script runs." hintLabel="About parameters">
        Execution parameters
      </SectionHeader>,
    )

    expect(screen.getByText('Execution parameters')).toBeInTheDocument()
    const info = screen.getByRole('button', { name: 'About parameters' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    await user.hover(info)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Values are supplied when the Script runs.')
  })
})
