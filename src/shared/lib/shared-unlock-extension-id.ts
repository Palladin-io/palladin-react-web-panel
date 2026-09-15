/** Syntax only. Browser transport must independently establish the exact ID. */
export function isSharedUnlockExtensionId(value: string): boolean {
  return value.length <= 256 && (/^[a-p]{32}$/.test(value) || isFirefoxSharedUnlockExtensionId(value)
    || isSafariSharedUnlockExtensionId(value))
}

/** Safari runtime ID, not its percent-encoded WebDriver installation URL value.
 * UNSIGNED is an explicit development identity, never a fallback from a team ID. */
export function isSafariSharedUnlockExtensionId(value: string): boolean {
  return value.length <= 256 && /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+ \((?:[A-Z0-9]{10}|UNSIGNED)\)$/.test(value)
}

export function isFirefoxSharedUnlockExtensionId(value: string): boolean {
  return value.length <= 256 && (/^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/.test(value)
    || /^\{[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}\}$/.test(value))
}

/** Routing choice only; spoofed UA cannot supply recipient authority. All
 * adapters still independently verify their explicitly configured exact ID. */
export function selectSharedUnlockExtension(userAgent: string, chromiumId: string, firefoxId: string, safariId = '') {
  if (/Firefox\/\d+/.test(userAgent)) return { transport: 'firefox' as const, extensionId: firefoxId }
  if (/Version\/\d+.*Safari\/\d+/.test(userAgent) && !/(?:Chrome|Chromium|CriOS|Edg|OPR|FxiOS)\//.test(userAgent)) {
    return { transport: 'safari' as const, extensionId: safariId }
  }
  return { transport: 'chromium' as const, extensionId: chromiumId }
}
