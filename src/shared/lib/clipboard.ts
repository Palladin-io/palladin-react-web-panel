/**
 * Copy a string to the clipboard, resolving `true` on success.
 *
 * Prefers the async Clipboard API and falls back to a hidden-textarea
 * `execCommand('copy')` when it is unavailable (insecure context, older
 * browsers, or a denied permission). Callers drive their own feedback off the
 * boolean result so copy affordances stay consistent across the app.
 */
export async function copyToClipboard(value: string): Promise<boolean> {
  if (!value) return false

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      // A newer copy (secret or not) now owns the clipboard — cancel any pending
      // auto-clear so it can't wipe this value.
      lastCopiedSecret = null
      return true
    }
  } catch {
    // Fall through to the legacy path below.
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'absolute'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const succeeded = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (succeeded) lastCopiedSecret = null
    return succeeded
  } catch {
    return false
  }
}

/** Default window before a copied secret is auto-cleared from the clipboard. */
export const CLIPBOARD_CLEAR_MS = 25_000

let clearTimer: ReturnType<typeof setTimeout> | null = null
let lastCopiedSecret: string | null = null

/**
 * Copy a *secret* to the clipboard and schedule an automatic clear.
 *
 * A left-behind password/key on the OS clipboard is a real exposure (other
 * apps, clipboard-history managers, the next paste). After `clearAfterMs` we
 * wipe it — but only if it is still the value we wrote:
 *   • a newer secret copy supersedes the timer (`lastCopiedSecret` guard), and
 *   • when the browser lets us read the clipboard back, we skip clearing if the
 *     user has since copied something else.
 * Clearing is best-effort: reading/writing the clipboard can be denied in an
 * insecure context, in which case we simply leave it.
 */
export async function copySecretToClipboard(
  value: string,
  clearAfterMs: number = CLIPBOARD_CLEAR_MS,
): Promise<boolean> {
  const ok = await copyToClipboard(value)
  if (!ok) return false

  lastCopiedSecret = value
  if (clearTimer !== null) clearTimeout(clearTimer)
  clearTimer = setTimeout(() => {
    void clearClipboardIfUnchanged(value)
  }, clearAfterMs)

  return true
}

async function clearClipboardIfUnchanged(expected: string): Promise<void> {
  clearTimer = null
  // A newer secret copy took ownership of the clipboard — leave it alone.
  if (lastCopiedSecret !== expected) return

  try {
    if (navigator.clipboard?.readText) {
      const current = await navigator.clipboard.readText()
      // The user copied something else in the meantime — don't stomp it.
      if (current !== expected) {
        // Only retract our own marker: a concurrent `copySecretToClipboard`
        // may have set `lastCopiedSecret` to a NEWER secret while we awaited
        // `readText()`. Clearing it unconditionally would clobber that marker
        // and strand the newer secret in the clipboard forever.
        if (lastCopiedSecret === expected) lastCopiedSecret = null
        return
      }
    }
  } catch {
    // Can't read the clipboard (permission / insecure context). We still wrote
    // this value via our own API and nothing newer replaced it, so clearing is
    // safe.
  }

  try {
    await navigator.clipboard?.writeText('')
  } catch {
    // Best-effort — nothing more we can do.
  }
  // Same guard as above: a newer secret may have been copied while `writeText`
  // was in flight; don't retract its marker.
  if (lastCopiedSecret === expected) lastCopiedSecret = null
}
