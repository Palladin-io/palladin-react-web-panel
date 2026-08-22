import { completeAgentIconUpload, presignAgentIcon } from './api/agents-api'
import type { AuthenticatedSessionSnapshot } from '../auth/session/session-boundary'

export const AGENT_ICON_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const AGENT_ICON_MAX_BYTES = 1024 * 1024
export const AGENT_ICON_MAX_MB = AGENT_ICON_MAX_BYTES / (1024 * 1024)

/** Discriminated result so callers can map each failure to a translated message. */
export type UploadAgentIconResult =
  | { ok: true; iconReference: string; iconUrl: string }
  | { ok: false; reason: 'invalid-type' | 'too-large' | 'failed' }

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
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
  session: AuthenticatedSessionSnapshot,
  assertSessionCurrent: () => void,
): Promise<UploadAgentIconResult> {
  if (!AGENT_ICON_ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, reason: 'invalid-type' }
  }
  if (file.size > AGENT_ICON_MAX_BYTES) {
    return { ok: false, reason: 'too-large' }
  }

  try {
    const sha256 = await sha256Hex(file)
    assertSessionCurrent()
    const { uploadUrl, uploadSessionId, maximumBytes } = await presignAgentIcon(agentId, {
      mediaType: file.type,
      byteLength: file.size,
      sha256,
    }, session)
    assertSessionCurrent()
    if (file.size > maximumBytes) return { ok: false, reason: 'too-large' }
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`)
    assertSessionCurrent()
    const completed = await completeAgentIconUpload(
      agentId,
      uploadSessionId,
      session,
    )
    return {
      ok: true,
      iconReference: `public-asset:${completed.assetId}`,
      iconUrl: `${completed.publicUrl}?v=${completed.revision}`,
    }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
