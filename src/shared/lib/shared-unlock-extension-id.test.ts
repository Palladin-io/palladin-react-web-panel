import { describe, expect, it } from 'vitest'
import { isSafariSharedUnlockExtensionId, isSharedUnlockExtensionId, selectSharedUnlockExtension } from './shared-unlock-extension-id'

describe('shared unlock browser configuration selection', () => {
  it('uses the Gecko ID for both Firefox transport and all local account/link scopes', () => {
    expect(selectSharedUnlockExtension('Mozilla/5.0 Firefox/155.0', 'a'.repeat(32), 'configured@example.test'))
      .toEqual({ transport: 'firefox', extensionId: 'configured@example.test' })
  })
  it('does not fall back to a Chromium identity when Firefox is unconfigured', () => {
    expect(selectSharedUnlockExtension('Firefox/155.0', 'a'.repeat(32), ''))
      .toEqual({ transport: 'firefox', extensionId: '' })
  })
  it('preserves the configured Chromium identity', () => {
    expect(selectSharedUnlockExtension('Chrome/153.0.0.0', 'a'.repeat(32), 'configured@example.test'))
      .toEqual({ transport: 'chromium', extensionId: 'a'.repeat(32) })
  })
  it('selects only the explicit Safari identity and never falls back when absent', () => {
    const ua = 'Mozilla/5.0 (Macintosh) Version/26.6 Safari/605.1.15'
    expect(selectSharedUnlockExtension(ua, 'a'.repeat(32), 'configured@example.test', 'com.example.Extension (ABCDEFGHIJ)'))
      .toEqual({ transport: 'safari', extensionId: 'com.example.Extension (ABCDEFGHIJ)' })
    expect(selectSharedUnlockExtension(ua, 'a'.repeat(32), 'configured@example.test'))
      .toEqual({ transport: 'safari', extensionId: '' })
  })
  it.each(['Chrome', 'Chromium', 'Edg', 'OPR'])('does not select Safari from %s compatibility tokens', browser => {
    expect(selectSharedUnlockExtension(`${browser}/153.0 Version/26.6 Safari/605.1`, 'a'.repeat(32), '', 'com.example.Extension (ABCDEFGHIJ)'))
      .toEqual({ transport: 'chromium', extensionId: 'a'.repeat(32) })
  })
  it.each(['com.example.Extension (ABCDEFGHIJ)', 'com.apple.Safari.UnpackedExtensions.ABC123 (UNSIGNED)'])('accepts explicit Safari syntax %s', id => {
    expect(isSafariSharedUnlockExtensionId(id)).toBe(true)
    expect(isSharedUnlockExtensionId(id)).toBe(true)
  })
  it.each(['com.example.Extension%20(ABCDEFGHIJ)', 'com.example.Extension', 'com.example.Extension (SHORT)',
    'com.example.Extension (abcdefghij)', '*.example.Extension (ABCDEFGHIJ)', 'com.example.Extension (ABCDEFGHIJ) ',
    ' com.example.Extension (ABCDEFGHIJ)', 'safari-web-extension://example/', 'com.example_extension (ABCDEFGHIJ)',
    `com.${'a'.repeat(250)} (ABCDEFGHIJ)`])('rejects noncanonical Safari identity %s', id => {
    expect(isSafariSharedUnlockExtensionId(id)).toBe(false)
  })
})
