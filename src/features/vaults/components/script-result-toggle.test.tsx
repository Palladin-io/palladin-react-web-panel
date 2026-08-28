import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ScriptResultToggle } from './script-result-toggle'

describe('ScriptResultToggle', () => {
  it('uses a Palladin switch and plain-language result guidance', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ScriptResultToggle checked onChange={onChange} />)

    expect(screen.getByText('Return the Script result to the Agent')).toBeInTheDocument()
    expect(screen.getByText('After execution, the Agent receives the Script result and can use it in its response.'))
      .toBeInTheDocument()
    expect(screen.queryByText(/Enabled by default/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(document.querySelector('input[type="checkbox"]')).not.toBeInTheDocument()

    await user.click(screen.getByRole('switch', { name: 'Return the Script result to the Agent' }))
    expect(onChange).toHaveBeenCalledWith(false)
  })
})
