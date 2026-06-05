/**
 * Centralised, DEV-only SignalR diagnostics. Logs at `info`/`warn` (not
 * `debug`, which the browser console hides at its default level) so the
 * connection lifecycle and event receipt are actually visible when diagnosing
 * "events don't arrive" issues. No payload bodies or tokens are logged — only
 * lifecycle state and the notification `type`.
 */
const PREFIX = '[SignalR]'

export const signalrLog = {
  info(message: string, ...args: unknown[]) {
    if (import.meta.env.DEV) console.info(`${PREFIX} ${message}`, ...args)
  },
  warn(message: string, ...args: unknown[]) {
    if (import.meta.env.DEV) console.warn(`${PREFIX} ${message}`, ...args)
  },
}
