import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ScriptParameterDraft } from '../script-parameters'
import { ScriptParametersEditor } from './script-parameters-editor'

const parameter: ScriptParameterDraft = {
  id: 'parameter-1',
  name: 'activeOnly',
  description: 'Return only active users',
  type: 'boolean',
  required: true,
  allowedValues: '',
}

describe('ScriptParametersEditor UI', () => {
  it('presents the execution contract as a compact Agent-to-Script mapping', () => {
    render(<ScriptParametersEditor parameters={[parameter]} onChange={vi.fn()} />)

    expect(screen.getByText('Agent')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('activeOnly')
    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveValue('boolean')
    expect(screen.getByLabelText('Description')).toHaveValue('Return only active users')
    expect(screen.getByRole('switch', { name: 'Required' })).toHaveAttribute('aria-checked', 'true')
    expect(document.querySelector('input[type="checkbox"]')).not.toBeInTheDocument()
  })

  it('updates required through the Palladin switch', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ScriptParametersEditor parameters={[parameter]} onChange={onChange} />)

    await user.click(screen.getByRole('switch', { name: 'Required' }))

    expect(onChange).toHaveBeenCalledWith([{ ...parameter, required: false }])
  })
})
