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
