/**
 * Trigger a browser download of in-memory text as a file. Wraps the
 * Blob → object-URL → anchor-click → revoke dance so callers don't repeat it.
 * The object URL is always revoked, so no blob lingers after the download.
 */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/plain',
): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Download a caller-owned byte buffer without retaining it. The caller remains
 * responsible for wiping the buffer immediately after this synchronous call. */
export function downloadBytesFile(
  filename: string,
  content: Uint8Array,
  mime = 'application/octet-stream',
): void {
  const blob = new Blob([content as BlobPart], { type: mime })
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Trigger a browser download of an already-hosted file via a transient anchor —
 * unlike `window.location.assign` this never navigates the SPA away (which would
 * drop in-memory keys) even when the server omits Content-Disposition.
 */
export function downloadFromUrl(url: string): void {
  const link = document.createElement('a')
  link.href = url
  link.download = ''
  document.body.appendChild(link)
  link.click()
  link.remove()
}
