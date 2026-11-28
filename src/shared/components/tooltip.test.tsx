import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Tooltip } from './tooltip'

afterEach(() => {
  document.documentElement.style.fontSize = ''
  vi.useRealTimers()
})

it('keeps a full-width bubble inside the viewport at the panel rem scale', () => {
  vi.useFakeTimers()
  document.documentElement.style.fontSize = '20px'
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1520 })
  render(<Tooltip content="Explanation" always><span>Sandbox</span></Tooltip>)
  const trigger = screen.getByText('Sandbox').parentElement as HTMLElement
  trigger.getBoundingClientRect = () => ({ left: 1440, right: 1500, top: 300, bottom: 320, width: 60, height: 20, x: 1440, y: 300, toJSON: () => ({}) })

  fireEvent.mouseEnter(trigger)
  act(() => { vi.advanceTimersByTime(150) })

  // A 20rem (400px) bubble centred here must leave its 12px margin to the right edge.
  expect(screen.getByRole('tooltip').style.left).toBe(`${1520 - 200 - 12}px`)
})
