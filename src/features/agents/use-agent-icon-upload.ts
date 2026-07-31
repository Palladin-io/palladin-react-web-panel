import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { AGENTS_QUERY_KEY } from './use-agents'
import { agentQueryKey } from './use-agent'
import { AGENT_ICON_MAX_MB, uploadAgentIcon } from './upload-agent-icon'

/**
 * Uploads and completes a custom agent icon. Completion atomically stores the
 * stable `public-asset:{id}` reference on the backend aggregate.
 * Invalidates list + detail queries so the new icon shows up immediately.
 */
export function useAgentIconUpload(agentId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File): Promise<string | null> {
    setIsUploading(true)
    setError(null)

    const result = await uploadAgentIcon(agentId, file)
    if (!result.ok) {
      setIsUploading(false)
      if (result.reason === 'invalid-type') {
        setError(t('vault.iconUploadError.invalidType'))
      } else if (result.reason === 'too-large') {
        setError(t('vault.iconUploadError.tooLarge', { maxMb: AGENT_ICON_MAX_MB }))
      } else {
        setError(t('vault.iconUploadError.failed'))
      }
      return null
    }

    try {
      queryClient.invalidateQueries({ queryKey: AGENTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: agentQueryKey(agentId) })
      return result.iconReference
    } catch {
      setError(t('vault.iconUploadError.failed'))
      return null
    } finally {
      setIsUploading(false)
    }
  }

  return { upload, isUploading, error }
}
