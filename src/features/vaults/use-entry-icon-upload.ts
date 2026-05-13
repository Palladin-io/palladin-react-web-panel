import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { presignEntryIcon, updateEntry, uploadToS3 } from './api/vault-api'
import { extensionFromMime } from './use-vault-icon-upload'

type UploadState = 'idle' | 'uploading' | 'error'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 2 * 1024 * 1024
const MAX_MB = MAX_BYTES / (1024 * 1024)

/**
 * Two-step entry icon upload — mirror of {@link useVaultIconUpload} for
 * the entry detail page. Validates locally, presigns S3, uploads the
 * file, then PATCHes the entry with the public URL so the icon shows up
 * on the next refetch. Errors translate to localised `vault.iconUploadError.*`
 * messages so the UI can render a single feedback line regardless of
 * which step failed.
 */
export function useEntryIconUpload(
  vaultId: string,
  entryId: string,
  onSuccess: (publicUrl: string) => void,
) {
  const { t } = useTranslation()
  const [state, setState] = useState<UploadState>('idle')
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(t('vault.iconUploadError.invalidType'))
      return
    }
    if (file.size > MAX_BYTES) {
      setError(t('vault.iconUploadError.tooLarge', { maxMb: MAX_MB }))
      return
    }

    setState('uploading')
    setError(null)

    try {
      const ext = extensionFromMime(file.type)
      const { uploadUrl, publicUrl } = await presignEntryIcon(vaultId, entryId, ext)
      await uploadToS3(uploadUrl, file)
      await updateEntry(vaultId, entryId, { icon: publicUrl })
      onSuccess(publicUrl)
      setState('idle')
    } catch {
      setState('error')
      setError(t('vault.iconUploadError.failed'))
    }
  }

  return { upload, state, error, isUploading: state === 'uploading' }
}
