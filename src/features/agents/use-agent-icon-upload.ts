import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { presignAgentIcon, updateAgent } from './api/agents-api'
import { AGENTS_QUERY_KEY } from './use-agents'
import { agentQueryKey } from './use-agent'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 2 * 1024 * 1024
const MAX_MB = MAX_BYTES / (1024 * 1024)

function extensionFromMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

async function uploadToS3(url: string, file: File): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`)
}

/**
 * Uploads a custom agent icon: presign → PUT to S3 → PATCH agent.iconKey.
 * Returns the cache-busted public URL on success, `null` on validation/upload failure.
 * Invalidates list + detail queries so the new icon shows up immediately.
 */
export function useAgentIconUpload(agentId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File): Promise<string | null> {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(t('vault.iconUploadError.invalidType'))
      return null
    }
    if (file.size > MAX_BYTES) {
      setError(t('vault.iconUploadError.tooLarge', { maxMb: MAX_MB }))
      return null
    }

    setIsUploading(true)
    setError(null)

    try {
      const ext = extensionFromMime(file.type)
      const { uploadUrl, publicUrl } = await presignAgentIcon(agentId, ext)
      await uploadToS3(uploadUrl, file)
      // Append cache-buster so the image actually refreshes if the same URL is reused.
      const cacheBusted = `${publicUrl}?v=${Date.now()}`
      await updateAgent(agentId, { iconKey: cacheBusted })
      queryClient.invalidateQueries({ queryKey: AGENTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: agentQueryKey(agentId) })
      return cacheBusted
    } catch {
      setError(t('vault.iconUploadError.failed'))
      return null
    } finally {
      setIsUploading(false)
    }
  }

  return { upload, isUploading, error }
}
