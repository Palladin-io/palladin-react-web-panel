import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY } from '../types'
import { EntryIcon } from './entry-icon'

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
})
