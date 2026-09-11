import { describe, expect, it } from 'vitest'
import { selectSharedUnlockExtension } from './shared-unlock-extension-id'

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
})
