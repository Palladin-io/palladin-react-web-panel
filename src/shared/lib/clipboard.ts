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
    return succeeded
  } catch {
    return false
  }
}
