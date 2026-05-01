import { useState } from 'react'
import { presignVaultIcon, uploadToS3, updateVault } from './api/vault-api'

type UploadState = 'idle' | 'uploading' | 'error'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 2 * 1024 * 1024

function extensionFromMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

export function useVaultIconUpload(vaultId: string, onSuccess: (publicUrl: string) => void) {
  const [state, setState] = useState<UploadState>('idle')
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Allowed formats: PNG, JPEG, WebP')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Max file size is 2 MB')
      return
    }

    setState('uploading')
    setError(null)

    try {
      const ext = extensionFromMime(file.type)
      const { uploadUrl, publicUrl } = await presignVaultIcon(vaultId, ext)
      await uploadToS3(uploadUrl, file)
      await updateVault(vaultId, { icon: publicUrl })
      onSuccess(publicUrl)
      setState('idle')
    } catch {
      setState('error')
      setError('Upload failed. Please try again.')
    }
  }

  return { upload, state, error, isUploading: state === 'uploading' }
}
