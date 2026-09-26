import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('public asset configuration', () => {
  it.each(['', '   '])('rejects external catalog images without an explicit asset namespace (%j)', async (value) => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com')
    vi.stubEnv('VITE_PUBLIC_ASSET_URL', value)
    vi.resetModules()
    const { trustedPublicAssetUrl } = await import('../api/public-assets-api')
    expect(trustedPublicAssetUrl('https://assets.palladin.io/published/icon.png')).toBeNull()
    expect(trustedPublicAssetUrl('https://assets.example.com/published/icon.png')).toBeNull()
  })

  it('accepts only the explicitly configured deployment namespace', async () => {
    vi.stubEnv('VITE_PUBLIC_ASSET_URL', 'https://assets.example.com/catalog')
    vi.resetModules()
    const { trustedPublicAssetUrl } = await import('../api/public-assets-api')
    expect(trustedPublicAssetUrl('https://assets.example.com/catalog/icon.png')).toBe('https://assets.example.com/catalog/icon.png')
    expect(trustedPublicAssetUrl('https://assets.example.com/other/icon.png')).toBeNull()
    expect(trustedPublicAssetUrl('https://assets.palladin.io/catalog/icon.png')).toBeNull()
  })
})
