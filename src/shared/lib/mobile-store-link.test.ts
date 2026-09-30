import { describe, expect, it } from 'vitest'
import { mobilePlatform, mobileStoreLink } from './mobile-store-link'

const apple = 'https://apps.apple.com/app/example/id123456789'
const android = 'https://play.google.com/store/apps/details?id=com.example.mobile'

describe('mobile download fallback', () => {
  it('uses platform hints for presentation only, not installation detection', () => {
    expect(mobilePlatform('iPhone', 1)).toBe('ios')
    expect(mobilePlatform('iPad', 1)).toBe('ios')
    expect(mobilePlatform('Macintosh', 5)).toBe('ios')
    expect(mobilePlatform('Macintosh', 0)).toBeNull()
    expect(mobilePlatform('Android', 1)).toBe('android')
  })
  it('selects an explicit store URL without adding sharing material or tracking', () => {
    expect(mobileStoreLink('ios', apple, android)).toBe(apple)
    expect(mobileStoreLink('android', apple, android)).toBe(android)
    expect(mobileStoreLink(null, apple, android)).toBeNull()
    expect(mobileStoreLink('ios', '', android)).toBeNull()
  })
  it.each([
    'https://apps.apple.com.evil.example/app/example/id123456789',
    'https://user:secret@apps.apple.com/app/example/id123456789',
    'http://apps.apple.com/app/example/id123456789',
    `${apple}#secret`, `${apple}?redirect=secret`, `${apple}?utm_source=share`,
    'https://apps.apple.com:444/app/example/id123456789', 'javascript:alert(1)',
  ])('rejects Apple store redirects, credentials and secret/tracking material', (value) => {
    expect(mobileStoreLink('ios', value, android)).toBeNull()
  })
  it.each([`${android}&referrer=secret`, `${android}&id=com.other.app`, `${android}#secret`,
    'https://play.google.com/store/apps/details?id=bad', 'https://example.com/redirect',
  ])('rejects Android install referrers and ambiguous IDs', (value) => {
    expect(mobileStoreLink('android', apple, value)).toBeNull()
  })
})
