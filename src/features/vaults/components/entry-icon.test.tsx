import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY } from '../types'
import { EntryIcon } from './entry-icon'

const catalog = vi.hoisted(() => ({
  revision: 0,
  resolved: false,
  listeners: new Set<() => void>(),
}))

vi.mock('../../../shared/api/public-assets-api', () => ({
  cachedPublicAsset: (id: string) => id === '11111111-1111-4111-8111-111111111111'
    ? { id, url: 'https://assets.example.test/github.png' }
    : undefined,
  cachedWebsiteAsset: (hostname: string) => hostname === 'discord.com' || catalog.resolved && hostname === 'later.example.com'
    ? { url: 'https://assets.example.test/discord.png' }
    : undefined,
  subscribePublicAssetCache: (listener: () => void) => {
    catalog.listeners.add(listener)
    return () => catalog.listeners.delete(listener)
  },
  publicAssetCacheRevision: () => catalog.revision,
}))

describe('EntryIcon', () => {
  it('rejects a remote icon URL and renders the safe type glyph', () => {
    render(<EntryIcon icon="https://cdn.example.com/favicon.png" type={ENTRY_TYPE_CREDENTIAL} />)
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('language')).toBeInTheDocument()
  })

  it('falls back to the type glyph when a local decrypted image fails to load', () => {
    render(<EntryIcon icon="blob:local-icon" type={ENTRY_TYPE_CREDENTIAL} />)
    const img = document.querySelector('img') as HTMLImageElement
    fireEvent.error(img)
    // Credential default glyph is "language"; the broken image is gone.
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('language')).toBeInTheDocument()
  })

  it('renders a Material glyph directly for a non-URL icon', () => {
    render(<EntryIcon icon="vpn_key" type={ENTRY_TYPE_KEY} />)
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('vpn_key')).toBeInTheDocument()
  })

  it('renders a URL only when it was resolved from a trusted public asset reference', () => {
    render(
      <EntryIcon
        icon="public-asset:11111111-1111-4111-8111-111111111111"
        type={ENTRY_TYPE_CREDENTIAL}
      />,
    )
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      'https://assets.example.test/github.png',
    )
  })

  it('renders a catalog icon resolved from an encrypted website hostname', () => {
    render(<EntryIcon icon="website:discord.com" type={ENTRY_TYPE_CREDENTIAL} />)
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://assets.example.test/discord.png')
  })

  it('updates a mounted icon when background catalog acquisition completes', () => {
    catalog.resolved = false
    const { container } = render(<EntryIcon icon="website:later.example.com" type={ENTRY_TYPE_CREDENTIAL} />)
    expect(container.querySelector('img')).toBeNull()

    act(() => {
      catalog.resolved = true
      catalog.revision += 1
      for (const listener of catalog.listeners) listener()
    })

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://assets.example.test/discord.png')
  })
})
