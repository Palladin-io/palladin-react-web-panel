import { describe, expect, it } from 'vitest'
import { fromBase64, fromBase64Url, toBase64, toBase64Url } from './encoding'

describe('base64 encoding', () => {
  it('round-trips arbitrary bytes', () => {
    const input = new Uint8Array([0, 1, 2, 3, 254, 255, 64, 128])
    const encoded = toBase64(input)
    const decoded = fromBase64(encoded)

    expect(decoded).toEqual(input)
  })

  it('produces the expected base64 string for known input', () => {
    expect(toBase64(new Uint8Array([0, 0, 0]))).toBe('AAAA')
    expect(toBase64(new Uint8Array([72, 105]))).toBe('SGk=')
  })

  it('handles an empty array', () => {
    expect(toBase64(new Uint8Array([]))).toBe('')
    expect(fromBase64('')).toEqual(new Uint8Array([]))
  })
})

describe('canonical base64url encoding', () => {
  it('round-trips without padding', () => {
    const input = new Uint8Array([251, 255, 239, 1])
    expect(toBase64Url(input)).toBe('-__vAQ')
    expect(fromBase64Url('-__vAQ')).toEqual(input)
  })

  it('rejects padded, standard-alphabet, and invalid-length input', () => {
    expect(() => fromBase64Url('AQ==')).toThrow(/base64url/)
    expect(() => fromBase64Url('+/8')).toThrow(/base64url/)
    expect(() => fromBase64Url('a')).toThrow(/base64url/)
  })
})
