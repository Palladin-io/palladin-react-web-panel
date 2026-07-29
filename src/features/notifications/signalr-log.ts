/**
 * Centralised, DEV-only SignalR diagnostics. Logs at `info`/`warn` (not
 * `debug`, which the browser console hides at its default level) so the
 * connection lifecycle and event receipt are actually visible when diagnosing
 * "events don't arrive" issues. No payload bodies or tokens are logged — only
 * lifecycle state and the notification `type`.
 */
const PREFIX = '[SignalR]'
const ACCESS_TOKEN_PATTERN = /([?&]access_token=)[^&\s]+/gi
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g

export function redactSignalRDiagnostic(value: string): string {
  return value
    .replace(ACCESS_TOKEN_PATTERN, '$1[REDACTED]')
    .replace(JWT_PATTERN, '[REDACTED_JWT]')
}

export const signalrLog = {
  info(message: string, ...args: string[]) {
    if (import.meta.env.DEV) console.info(
      `${PREFIX} ${redactSignalRDiagnostic(message)}`,
      ...args.map(redactSignalRDiagnostic),
    )
  },
  warn(message: string, ...args: string[]) {
    if (import.meta.env.DEV) console.warn(
      `${PREFIX} ${redactSignalRDiagnostic(message)}`,
      ...args.map(redactSignalRDiagnostic),
    )
  },
}
