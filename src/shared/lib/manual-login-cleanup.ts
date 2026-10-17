let clearingForLogin = false

export function duringManualLoginCleanup<T>(cleanup: () => T): T {
  const previous = clearingForLogin
  clearingForLogin = true
  try { return cleanup() }
  finally { clearingForLogin = previous }
}

export function isManualLoginCleanup(): boolean { return clearingForLogin }
