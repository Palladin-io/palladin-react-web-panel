import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ScriptEditor } from './script-editor'

vi.mock('@uiw/react-codemirror', () => ({
  default: ({ height }: { height?: string }) => (
    <div data-testid="code-mirror" data-height={height} />
  ),
}))

describe('ScriptEditor', () => {
  it('uses the configured height as a resizable starting size', () => {
    render(<ScriptEditor value="echo ok" onChange={vi.fn()} interpreter="bash" />)

    const frame = screen.getByTestId('script-editor-frame')
    expect(frame).toHaveClass('resize-y')
    expect(frame).toHaveStyle({ height: '11.875rem' })
    expect(screen.getByTestId('code-mirror')).toHaveAttribute('data-height', '100%')
  })
})
