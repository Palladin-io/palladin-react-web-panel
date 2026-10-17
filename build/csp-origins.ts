/** Build-time deployment configuration, never a URL supplied by a web page. */
export function connectionOrigins(apiUrl?: string, signalrUrl?: string, allowInsecureHttp = false): string {
  const origins = new Set<string>()
  for (const [value, websocket] of [[apiUrl, false], [signalrUrl, true]] as const) {
    if (!value?.trim()) continue
    const url = new URL(value)
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && (loopback || allowInsecureHttp)))
      || url.username || url.password || url.search || url.hash || url.hostname.includes('*') || /\s/.test(value)) {
      throw new Error('API and SignalR URLs must use HTTPS (or explicitly approved HTTP), without credentials, query, fragment or wildcard')
    }
    origins.add(url.origin)
    if (websocket) origins.add(url.origin.replace(/^http/, 'ws'))
  }
  return [...origins].join(' ')
}
