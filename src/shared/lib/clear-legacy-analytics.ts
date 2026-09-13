/** Remove data written by the pre-consent PostHog SDK without loading that SDK. */
export function clearLegacyAnalytics() {
  const isAnalyticsKey = (key: string) => /^ph_.+_posthog$/.test(key) || key.startsWith('__ph_opt_in_out_')
  for (const getStorage of [() => localStorage, () => sessionStorage]) {
    try {
      const storage = getStorage()
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      for (const key of keys) if (key && isAnalyticsKey(key)) storage.removeItem(key)
    } catch { /* Unavailable storage cannot authorize analytics. */ }
  }
  const domains = location.hostname.split('.')
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.trim().split('=')[0]
    if (!isAnalyticsKey(name)) continue
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`
    for (let index = 0; index < domains.length - 1; index++) {
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${domains.slice(index).join('.')}; SameSite=Lax`
    }
  }
}
