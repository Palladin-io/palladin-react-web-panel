import { presignAgentIcon } from './api/agents-api'

export const AGENT_ICON_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const AGENT_ICON_MAX_BYTES = 2 * 1024 * 1024
export const AGENT_ICON_MAX_MB = AGENT_ICON_MAX_BYTES / (1024 * 1024)

/** Discriminated result so callers can map each failure to a translated message. */
export type UploadAgentIconResult =
  | { ok: true; iconUrl: string }
  | { ok: false; reason: 'invalid-type' | 'too-large' | 'failed' }

function extensionFromMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

/**
 * Validates a custom agent icon (type + size), presigns, and PUTs it to S3.
 * Returns the cache-busted public URL on success. Does NOT PATCH the agent —
 * callers decide whether to persist immediately or defer until confirm.
 *
 * Shared by `useAgentIconUpload` (edit flow) and `ApproveAgentDialog` (approve flow)
 * so both stay in lockstep on size/type rules.
 */
export async function uploadAgentIcon(
  agentId: string,
  file: File,
): Promise<UploadAgentIconResult> {
  if (!AGENT_ICON_ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, reason: 'invalid-type' }
  }
  if (file.size > AGENT_ICON_MAX_BYTES) {
    return { ok: false, reason: 'too-large' }
  }

  try {
    const ext = extensionFromMime(file.type)
    const { uploadUrl, publicUrl } = await presignAgentIcon(agentId, ext)
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`)
    // Append cache-buster so the image refreshes even if the same URL is reused.
    return { ok: true, iconUrl: `${publicUrl}?v=${Date.now()}` }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
