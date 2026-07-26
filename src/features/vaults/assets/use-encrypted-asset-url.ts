import { useEffect, useState } from 'react'
import {
  decryptPresentationAsset,
  validatePresentationAssetDimensions,
  type EncryptedAssetScope,
} from '../../../shared/crypto/vault-v2-assets'
import { wipe } from '../../../shared/crypto/sodium'
import { downloadEncryptedAsset } from './encrypted-asset-api'

export function useEncryptedAssetUrl(scope: EncryptedAssetScope | null, baseKey: Uint8Array | null): {
  url: string | null
  corrupt: boolean
} {
  const scopeKey = scope
    ? `${scope.organizationId}:${scope.vaultId}:${scope.assetId}:${scope.target}:${scope.entryId ?? ''}:${scope.keyVersion}:${scope.memberKeyGeneration}`
    : null
  const [state, setState] = useState<{ scopeKey: string; url: string | null; corrupt: boolean } | null>(null)
  const organizationId = scope?.organizationId
  const vaultId = scope?.vaultId
  const assetId = scope?.assetId
  const target = scope?.target
  const entryId = scope?.entryId
  const keyVersion = scope?.keyVersion
  const memberKeyGeneration = scope?.memberKeyGeneration

  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | null = null
    if (!scopeKey || !organizationId || !vaultId || !assetId || !target
      || keyVersion === undefined || memberKeyGeneration === undefined || !baseKey) {
      return () => controller.abort()
    }
    const activeScope: EncryptedAssetScope = {
      organizationId,
      vaultId,
      assetId,
      target,
      ...(entryId ? { entryId } : {}),
      keyVersion,
      memberKeyGeneration,
    }
    const key = new Uint8Array(baseKey)
    void (async () => {
      let plaintext: Uint8Array | undefined
      try {
        const remote = await downloadEncryptedAsset(vaultId, assetId, controller.signal)
        if (remote.target !== target || remote.entryId !== entryId) throw new Error('Encrypted asset API scope mismatch')
        const decrypted = await decryptPresentationAsset(remote.ciphertext, activeScope, key)
        plaintext = decrypted.bytes
        if (decrypted.mediaType !== remote.mediaType) throw new Error('Encrypted asset media type mismatch')
        const blob = new Blob([new Uint8Array(plaintext)], { type: decrypted.mediaType })
        await validatePresentationAssetDimensions(blob)
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        if (!controller.signal.aborted) setState({ scopeKey, url: objectUrl, corrupt: false })
      } catch {
        if (!controller.signal.aborted) setState({ scopeKey, url: null, corrupt: true })
      } finally {
        wipe(key)
        if (plaintext) wipe(plaintext)
      }
    })()
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [assetId, baseKey, entryId, keyVersion, memberKeyGeneration, organizationId, scopeKey, target, vaultId])

  return state?.scopeKey === scopeKey ? { url: state.url, corrupt: state.corrupt } : { url: null, corrupt: false }
}
