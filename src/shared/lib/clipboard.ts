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
      // A newer copy now owns the clipboard — cancel any pending auto-clear.
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
 * Copy a secret to the clipboard and auto-clear it after `clearAfterMs` — a
 * left-behind password/key is a real exposure (clipboard history, next paste).
 * Clear is best-effort and skipped if a newer value has since taken the clipboard.
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
      if (current !== expected) {
        // Only retract our own marker — a concurrent copy may have set a newer one.
        if (lastCopiedSecret === expected) lastCopiedSecret = null
        return
      }
    }
  } catch {
    // Can't read the clipboard (permission / insecure context) — clear anyway.
  }

  try {
    await navigator.clipboard?.writeText('')
  } catch {
    // Best-effort.
  }
  if (lastCopiedSecret === expected) lastCopiedSecret = null
}
