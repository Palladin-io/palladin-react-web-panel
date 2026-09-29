type MobilePlatform = 'ios' | 'android'

export function mobilePlatform(userAgent: string, touchPoints: number): MobilePlatform | null {
  if (/Android/i.test(userAgent)) return 'android'
  if (/iPhone|iPad|iPod/i.test(userAgent) || /Macintosh/i.test(userAgent) && touchPoints > 1) return 'ios'
  return null
}

export function mobileStoreLink(platform: MobilePlatform | null, apple: string, android: string): string | null {
  const configured = platform === 'ios' ? apple : platform === 'android' ? android : ''
  if (!configured) return null
  try {
    const url = new URL(configured)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null
    if (platform === 'ios' && url.hostname === 'apps.apple.com'
      && /^\/(?:[a-z]{2}\/)?app\/(?:[A-Za-z0-9-]+\/)?id[0-9]+$/.test(url.pathname) && !url.search) return url.href
    if (platform === 'android' && url.hostname === 'play.google.com' && url.pathname === '/store/apps/details'
      && url.searchParams.getAll('id').length === 1 && [...url.searchParams.keys()].every((key) => key === 'id')
      && /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(url.searchParams.get('id') ?? '')) return url.href
  } catch { /* Invalid deployment configuration never becomes an external navigation. */ }
  return null
}
