import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IconColorBrowser } from './vault-icon-browser'

const { searchPublicAssetsMock } = vi.hoisted(() => ({ searchPublicAssetsMock: vi.fn() }))

vi.mock('../../../shared/api/public-assets-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../shared/api/public-assets-api')>(),
  searchPublicAssets: searchPublicAssetsMock,
}))

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
  shield: '#EB4747',
  lock: '#EB4747',
  key: '#8A95A6',
  cloud: '#60A5FA',
  folder: '#FFAB87',
  code: '#10B981',
  home: '#A78BFA',
  work: '#FFAB87',
}

describe('IconColorBrowser', () => {
  beforeEach(() => {
    searchPublicAssetsMock.mockReset().mockResolvedValue([])
  })

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
        currentColor="#EB4747"
        onSelectColor={onSelectColor}
      />,
    )

    // Pick a different palette swatch (teal #10B981 -> "Teal").
    await user.click(screen.getByRole('button', { name: /color: teal/i }))
    await user.click(screen.getByRole('button', { name: /^choose$/i }))

    expect(onSelectIcon).toHaveBeenCalledWith('shield')
    expect(onSelectColor).toHaveBeenCalledWith('#10B981')
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

  it('keeps compact ID-only catalog references for Vault callers', async () => {
    const user = userEvent.setup()
    const onSelectIcon = vi.fn()
    searchPublicAssetsMock.mockResolvedValue([{
      id: '11111111-1111-4111-8111-111111111111',
      type: 'websiteIcon',
      name: 'GitHub',
      url: 'https://assets.palladin.io/github.png',
      revision: 1,
    }])

    render(
      <IconColorBrowser
        showBrandIcons
        open
        onClose={vi.fn()}
        icons={Array.from({ length: 20 }, (_, index) => `icon_${index}`)}
        iconColors={{}}
        currentIcon={undefined}
        onSelectIcon={onSelectIcon}
      />,
    )

    await user.type(screen.getByPlaceholderText(/search icons/i), 'github')
    await user.click(await screen.findByRole('button', { name: 'GitHub' }))
    await user.click(screen.getByRole('button', { name: /^choose$/i }))

    expect(onSelectIcon).toHaveBeenCalledWith('public-asset:11111111-1111-4111-8111-111111111111')
  })

  it('lets Entry callers supply the encrypted direct-URL reference format', async () => {
    const user = userEvent.setup()
    const onSelectIcon = vi.fn()
    searchPublicAssetsMock.mockResolvedValue([{
      id: '11111111-1111-4111-8111-111111111111',
      type: 'websiteIcon',
      name: 'GitHub',
      url: 'https://assets.palladin.io/github.png',
      revision: 2,
    }])

    render(
      <IconColorBrowser
        showBrandIcons
        publicAssetReference={(asset) => `entry:${asset.id}|${asset.revision}|${asset.url}`}
        open
        onClose={vi.fn()}
        icons={Array.from({ length: 20 }, (_, index) => `icon_${index}`)}
        iconColors={{}}
        currentIcon={undefined}
        onSelectIcon={onSelectIcon}
      />,
    )

    await user.type(screen.getByPlaceholderText(/search icons/i), 'github')
    await user.click(await screen.findByRole('button', { name: 'GitHub' }))
    await user.click(screen.getByRole('button', { name: /^choose$/i }))

    expect(onSelectIcon).toHaveBeenCalledWith(
      'entry:11111111-1111-4111-8111-111111111111|2|https://assets.palladin.io/github.png',
    )
  })
})
