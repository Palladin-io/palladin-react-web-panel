import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useReconcilePublicEntryAssets } from './use-public-entry-assets'

const catalog = vi.hoisted(() => ({
  resolved: new Set<string>(),
  resolve: vi.fn(async (hostnames: string[], acquireMissing = true) => {
    if (acquireMissing) hostnames.slice(0, 50).forEach((hostname) => catalog.resolved.add(hostname))
    return new Map()
  }),
}))

vi.mock('../../shared/api/public-assets-api', () => ({
  cachedWebsiteAsset: (hostname: string) => catalog.resolved.has(hostname) ? { id: hostname } : undefined,
  getPublicAssetsByIds: vi.fn(async () => []),
  resolveWebsiteIcons: catalog.resolve,
}))

afterEach(() => {
  vi.useRealTimers()
  catalog.resolved.clear()
  catalog.resolve.mockClear()
})

describe('useReconcilePublicEntryAssets', () => {
  it('hydrates the complete decrypted list after acquisition, including entries beyond the render window', async () => {
    vi.useFakeTimers()
    const references = Array.from({ length: 539 }, (_, index) => `website:host-${index}.example.com`)

    renderHook(() => useReconcilePublicEntryAssets(references))

    await act(async () => { await Promise.resolve() })
    expect(catalog.resolve).toHaveBeenCalledTimes(1)
    expect(catalog.resolve).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining(['host-0.example.com', 'host-538.example.com']),
      true,
    )

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })

    expect(catalog.resolve).toHaveBeenCalledTimes(2)
    expect(catalog.resolve).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining(['host-538.example.com']),
      false,
    )
  })
})
