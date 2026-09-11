/** Syntax only. Browser transport must independently establish the exact ID. */
export function isSharedUnlockExtensionId(value: string): boolean {
  return value.length <= 256 && (/^[a-p]{32}$/.test(value) || isFirefoxSharedUnlockExtensionId(value))
}

export function isFirefoxSharedUnlockExtensionId(value: string): boolean {
  return value.length <= 256 && (/^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/.test(value)
    || /^\{[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}\}$/.test(value))
}

/** Routing choice only; spoofed UA cannot supply recipient authority. Both
 * adapters still independently verify their explicitly configured exact ID. */
export function selectSharedUnlockExtension(userAgent: string, chromiumId: string, firefoxId: string) {
  return /Firefox\/\d+/.test(userAgent)
    ? { transport: 'firefox' as const, extensionId: firefoxId }
    : { transport: 'chromium' as const, extensionId: chromiumId }
}
