import { useState } from 'react'
import { useTranslation } from 'react-i18next'

type UploadState = 'idle' | 'uploading' | 'error'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 2 * 1024 * 1024
const MAX_MB = MAX_BYTES / (1024 * 1024)

/**
 * Map a MIME type to the file extension used for the S3 presign request.
 * Exported so the create-vault dialog can use the same mapping when it
 * uploads a custom icon during the two-step vault create flow.
 */
export function extensionFromMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

export function useVaultIconUpload(_vaultId: string, _onSuccess: (publicUrl: string) => void) {
  void _vaultId
  void _onSuccess
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

    // Vault v2 forbids plaintext/public presentation URLs. Do not upload until
    // the encrypted-asset container flow is available end-to-end.
    setState('error')
    setError(t('vault.iconUploadError.failed'))
  }

  return { upload, state, error, isUploading: state === 'uploading' }
}
