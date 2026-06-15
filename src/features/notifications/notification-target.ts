export function safeInternalTarget(target?: string | null): string | null {
  if (!target?.startsWith('/') || target.startsWith('//') || target.includes('\\')) {
    return null
  }
  return target
}
