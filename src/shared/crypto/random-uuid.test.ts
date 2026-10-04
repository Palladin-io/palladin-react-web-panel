import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUuid } from './random-uuid'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('randomUuid', () => {
  it('retains the native UUID implementation when available', () => {
    const value = '00112233-4455-4677-8899-aabbccddeeff'
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(value)
    expect(randomUuid()).toBe(value)
  })

  it('uses browser random bytes and UUID v4 bits when HTTP hides randomUUID', () => {
    vi.stubGlobal('crypto', { getRandomValues: (array: Uint8Array) => {
      array.set(Uint8Array.from({ length: 16 }, (_, index) => index))
      return array
    } })
    expect(randomUuid()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f')
  })

  it('fails if the browser cannot supply secure random bytes', () => {
    vi.stubGlobal('crypto', { getRandomValues: () => { throw new Error('CSPRNG unavailable') } })
    expect(() => randomUuid()).toThrow('CSPRNG unavailable')
  })
})
