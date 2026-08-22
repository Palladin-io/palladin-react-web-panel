import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { AGENTS_QUERY_KEY } from './use-agents'
import { agentQueryKey } from './use-agent'
import {
  AGENT_ICON_MAX_MB,
  uploadAgentIcon,
  type UploadAgentIconResult,
} from './upload-agent-icon'
import {
  authenticatedQueryKey,
  authenticatedSessionMatches,
  captureAuthenticatedSession,
  useAuthenticatedMutation,
} from '../auth'
import { registerAuthenticatedPrincipalReset } from '../../shared/lib/authenticated-principal-reset'

/**
 * Uploads and completes a custom agent icon. Completion atomically stores the
 * stable `public-asset:{id}` reference on the backend aggregate.
 * Invalidates list + detail queries so the new icon shows up immediately.
 */
export function useAgentIconUpload(agentId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => registerAuthenticatedPrincipalReset(() => setError(null)), [])

  const mutation = useAuthenticatedMutation({
    mutationKey: ['agents', agentId, 'icon-upload'],
    mutationFn: async (file: File, context): Promise<UploadAgentIconResult> => {
      const result = await uploadAgentIcon(
        agentId,
        file,
        context.sessionSnapshot,
        context.assertSessionCurrent,
      )
      context.assertSessionCurrent()
      return result
    },
    onSuccess: (result) => {
      if (result.ok) {
        setError(null)
        queryClient.invalidateQueries({ queryKey: authenticatedQueryKey(AGENTS_QUERY_KEY) })
        queryClient.invalidateQueries({
          queryKey: authenticatedQueryKey(agentQueryKey(agentId)),
        })
        return
      }
      if (result.reason === 'invalid-type') {
        setError(t('vault.iconUploadError.invalidType'))
      } else if (result.reason === 'too-large') {
        setError(t('vault.iconUploadError.tooLarge', { maxMb: AGENT_ICON_MAX_MB }))
      } else {
        setError(t('vault.iconUploadError.failed'))
      }
    },
  })

  async function uploadResult(file: File): Promise<UploadAgentIconResult | null> {
    const owner = captureAuthenticatedSession()
    setError(null)
    try {
      const result = await mutation.mutateAsync(file)
      return authenticatedSessionMatches(owner) ? result : null
    } catch {
      return null
    }
  }

  async function upload(file: File): Promise<string | null> {
    const result = await uploadResult(file)
    return result?.ok ? result.iconReference : null
  }

  return {
    upload,
    uploadResult,
    isUploading: mutation.isPending,
    error,
  }
}
