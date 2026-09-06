import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY } from '../types'
import { EntryIcon } from './entry-icon'

vi.mock('../../../shared/api/public-assets-api', () => ({
  trustedPublicAssetUrl: (value: string) => value.startsWith('https://assets.palladin.io/') ? value : null,
}))

describe('EntryIcon', () => {
  it('rejects a remote icon URL and renders the safe type glyph', () => {
    render(<EntryIcon icon="https://cdn.example.com/favicon.png" type={ENTRY_TYPE_CREDENTIAL} />)
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('svg[data-icon="language"]')).toBeInTheDocument()
  })

  it('falls back to the type glyph when a local decrypted image fails to load', () => {
    render(<EntryIcon icon="blob:local-icon" type={ENTRY_TYPE_CREDENTIAL} />)
    const img = document.querySelector('img') as HTMLImageElement
    fireEvent.error(img)
    // Credential default glyph is "language"; the broken image is gone.
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('svg[data-icon="language"]')).toBeInTheDocument()
  })

  it('renders a local SVG directly for a non-URL icon', () => {
    render(<EntryIcon icon="vpn_key" type={ENTRY_TYPE_KEY} />)
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('svg[data-icon="vpn_key"]')).toBeInTheDocument()
  })

  it('renders a URL only when it was resolved from a trusted public asset reference', () => {
    render(
      <EntryIcon
        icon="public-asset:11111111-1111-4111-8111-111111111111|1|https%3A%2F%2Fassets.palladin.io%2Fgithub.png"
        type={ENTRY_TYPE_CREDENTIAL}
      />,
    )
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      'https://assets.palladin.io/github.png',
    )
  })

  it('falls back immediately when a catalog object is unavailable', () => {
    render(
      <EntryIcon
        icon="public-asset:11111111-1111-4111-8111-111111111111|1|https%3A%2F%2Fassets.palladin.io%2Fmissing.png"
        type={ENTRY_TYPE_CREDENTIAL}
      />,
    )

    fireEvent.error(document.querySelector('img') as HTMLImageElement)

    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('svg[data-icon="language"]')).toBeInTheDocument()
  })

  it('rejects a catalog reference outside the configured asset namespace', () => {
    render(<EntryIcon
      icon="public-asset:11111111-1111-4111-8111-111111111111|1|https%3A%2F%2Fevil.example%2Ficon.png"
      type={ENTRY_TYPE_CREDENTIAL}
    />)
    expect(document.querySelector('img')).toBeNull()
  })
})
