import { analytics } from '../lib/analytics.ts'

interface ParsedUserAgent {
  browser: string
  os: string
}

function parseUserAgent(ua: string = navigator.userAgent): ParsedUserAgent {
  return {
    browser: parseBrowser(ua),
    os: parseOS(ua),
  }
}

function parseBrowser(ua: string): string {
  if (ua.includes('Edg/')) {
    const match = ua.match(/Edg\/([\d.]+)/)
    return `Edge ${match?.[1] ?? ''}`.trim()
  }

  if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
    const match = ua.match(/Chrome\/([\d.]+)/)
    return `Chrome ${match?.[1] ?? ''}`.trim()
  }

  if (ua.includes('Firefox/')) {
    const match = ua.match(/Firefox\/([\d.]+)/)
    return `Firefox ${match?.[1] ?? ''}`.trim()
  }

  if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
    const match = ua.match(/Version\/([\d.]+)/)
    return `Safari ${match?.[1] ?? ''}`.trim()
  }

  return 'Unknown'
}

function parseOS(ua: string): string {
  if (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod')) {
    return 'iOS'
  }
  if (ua.includes('Mac OS X') || ua.includes('Macintosh')) {
    return 'macOS'
  }
  if (ua.includes('Android')) {
    return 'Android'
  }
  if (ua.includes('Windows')) {
    return 'Windows'
  }
  if (ua.includes('Linux')) {
    return 'Linux'
  }
  return 'Unknown'
}

export function getAnalyticsHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}

  const sessionId = analytics.getSessionId()
  if (sessionId) {
    headers['x-session-id'] = sessionId
  }

  const { browser, os } = parseUserAgent()
  headers['x-user-agent'] = `Palladin/web (${browser}; ${os})`

  return headers
}

export { parseUserAgent }
