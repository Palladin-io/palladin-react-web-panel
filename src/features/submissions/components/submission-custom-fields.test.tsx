import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { SubmissionCustomFields } from './submission-custom-fields'
it('preserves line breaks in text and revealed concealed proposals without changing payloads', () => {
  const fields = [{ id: 'custom:text', label: 'Text', type: 'text' as const, value: 'first\nsecond' },
    { id: 'custom:secret', label: 'Secret', type: 'concealed' as const, value: 'alpha\nbeta' }]
  render(<SubmissionCustomFields fields={fields} />)
  expect(document.getElementById('custom:text-value')).toHaveValue('first\nsecond')
  fireEvent.click(screen.getByRole('button', { name: 'Reveal' }))
  expect(document.getElementById('custom:secret-value')).toHaveValue('alpha\nbeta')
  expect(fields[1].value).toBe('alpha\nbeta')
  fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
  expect(document.getElementById('custom:secret-value')).not.toHaveValue('alpha\nbeta')
})
