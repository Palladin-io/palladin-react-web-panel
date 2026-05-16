import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IconColorBrowser } from './vault-icon-browser'

const ICONS = [
  'shield',
  'lock',
  'key',
  'cloud',
  'folder',
  'code',
  'home',
  'work',
] as const

const ICON_COLORS: Record<string, string> = {
  shield: '#FF4F4F',
  lock: '#FF4F4F',
  key: '#8A95A6',
  cloud: '#60A5FA',
  folder: '#FFAB87',
  code: '#2EC4B6',
  home: '#A78BFA',
  work: '#FFAB87',
}

describe('IconColorBrowser', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <IconColorBrowser
        open={false}
        onClose={vi.fn()}
        icons={ICONS}
        iconColors={ICON_COLORS}
        currentIcon="shield"
        onSelectIcon={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the title, icon grid, and confirm button when open', () => {
    render(
      <IconColorBrowser
        open
        onClose={vi.fn()}
        icons={ICONS}
        iconColors={ICON_COLORS}
        currentIcon="shield"
        onSelectIcon={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: /choose icon/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^shield$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^choose$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
  })

  it('does not render the search input when the icon list is small (<=15)', () => {
    render(
      <IconColorBrowser
        open
        onClose={vi.fn()}
        icons={ICONS}
        iconColors={ICON_COLORS}
        currentIcon="shield"
        onSelectIcon={vi.fn()}
      />,
    )

    expect(screen.queryByPlaceholderText(/search icons/i)).not.toBeInTheDocument()
  })

  it('renders search input and filters icons when the list is large (>15)', async () => {
    const user = userEvent.setup()
    const bigList = Array.from({ length: 20 }, (_, i) => `icon_${i}`)
    const bigColors = Object.fromEntries(bigList.map((n) => [n, '#60A5FA']))

    render(
      <IconColorBrowser
        open
        onClose={vi.fn()}
        icons={bigList}
        iconColors={bigColors}
        currentIcon={undefined}
        onSelectIcon={vi.fn()}
      />,
    )

    const search = screen.getByPlaceholderText(/search icons/i)
    expect(search).toBeInTheDocument()

    await user.type(search, 'icon_1')

    // icon_1, icon_10..icon_19 match — 11 buttons.
    expect(screen.getByRole('button', { name: 'icon 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'icon 10' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'icon 2' })).not.toBeInTheDocument()
  })

  it('buffers icon selection — onSelectIcon only fires when Choose is clicked', async () => {
    const user = userEvent.setup()
    const onSelectIcon = vi.fn()
    const onClose = vi.fn()

    render(
      <IconColorBrowser
        open
        onClose={onClose}
        icons={ICONS}
        iconColors={ICON_COLORS}
        currentIcon="shield"
        onSelectIcon={onSelectIcon}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^cloud$/i }))
    // No propagation yet — the parent must not be notified mid-browse.
    expect(onSelectIcon).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /^choose$/i }))

    expect(onSelectIcon).toHaveBeenCalledTimes(1)
    expect(onSelectIcon).toHaveBeenCalledWith('cloud')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('propagates a color change alongside the icon when onSelectColor is provided', async () => {
    const user = userEvent.setup()
    const onSelectIcon = vi.fn()
    const onSelectColor = vi.fn()

    render(
      <IconColorBrowser
        open
        onClose={vi.fn()}
        icons={ICONS}
        iconColors={ICON_COLORS}
        currentIcon="shield"
        onSelectIcon={onSelectIcon}
        currentColor="#FF4F4F"
        onSelectColor={onSelectColor}
      />,
    )

    // Pick a different palette swatch (teal #2EC4B6 -> "Teal").
    await user.click(screen.getByRole('button', { name: /color: teal/i }))
    await user.click(screen.getByRole('button', { name: /^choose$/i }))

    expect(onSelectIcon).toHaveBeenCalledWith('shield')
    expect(onSelectColor).toHaveBeenCalledWith('#2EC4B6')
  })

  it('cancels without notifying when the user clicks Cancel', async () => {
    const user = userEvent.setup()
    const onSelectIcon = vi.fn()
    const onClose = vi.fn()

    render(
      <IconColorBrowser
        open
        onClose={onClose}
        icons={ICONS}
        iconColors={ICON_COLORS}
        currentIcon="shield"
        onSelectIcon={onSelectIcon}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^cloud$/i }))
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(onSelectIcon).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('disables the Choose button when no icon is selected', () => {
    render(
      <IconColorBrowser
        open
        onClose={vi.fn()}
        icons={ICONS}
        iconColors={ICON_COLORS}
        currentIcon={undefined}
        onSelectIcon={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /^choose$/i })).toBeDisabled()
  })
})
