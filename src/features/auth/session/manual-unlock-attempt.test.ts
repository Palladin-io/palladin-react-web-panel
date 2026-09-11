import { afterEach, expect, it } from 'vitest'
import { useAuthStore } from '../stores/auth-store'
import { beginManualUnlockAttempt, captureManualUnlockFence } from './manual-unlock-attempt'

afterEach(() => { beginManualUnlockAttempt().cancel(); useAuthStore.getState().logout() })

it('blocks receiver admission for the whole manual popup attempt, including newly captured receivers', () => {
  const before = captureManualUnlockFence()
  const popup = beginManualUnlockAttempt({ blockNewSharedUnlock: true })
  expect(before()).toBe(false)
  expect(captureManualUnlockFence()()).toBe(false)
  popup.assertCurrent()
  popup.cancel()
  expect(captureManualUnlockFence()()).toBe(true)
  expect(popup.isCurrent()).toBe(false)
})

it('cannot release a newer popup admission barrier from an older cleanup', () => {
  const older = beginManualUnlockAttempt({ blockNewSharedUnlock: true })
  const newer = beginManualUnlockAttempt({ blockNewSharedUnlock: true })
  older.cancel()
  expect(captureManualUnlockFence()()).toBe(false)
  newer.assertCurrent()
  newer.cancel()
  expect(captureManualUnlockFence()()).toBe(true)
})
