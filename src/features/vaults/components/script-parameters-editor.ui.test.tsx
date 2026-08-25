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
  it('keeps secondary parameter settings collapsed by default', () => {
    render(<ScriptParametersEditor parameters={[parameter]} onChange={vi.fn()} />)

    expect(screen.getByLabelText('Name')).toHaveValue('activeOnly')
    expect(screen.queryByText('Agent')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Type' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Description')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show details for activeOnly' }))
      .toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Required')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument()
    expect(document.querySelector('input[type="checkbox"]')).not.toBeInTheDocument()
  })

  it('reveals type, description and allowed values on demand', async () => {
    const user = userEvent.setup()
    render(<ScriptParametersEditor parameters={[parameter]} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Show details for activeOnly' }))

    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveValue('boolean')
    expect(screen.getByLabelText('Description')).toHaveValue('Return only active users')
    expect(screen.getByLabelText('Allowed values (optional)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide details for activeOnly' }))
      .toHaveAttribute('aria-expanded', 'true')
  })

  it('updates required status through the row actions menu', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ScriptParametersEditor parameters={[parameter]} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Make optional' }))

    expect(onChange).toHaveBeenCalledWith([{ ...parameter, required: false }])
  })
})
