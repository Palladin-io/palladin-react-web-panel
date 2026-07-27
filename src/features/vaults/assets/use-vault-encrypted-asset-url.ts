import { useEffect, useState } from 'react'
import { decryptPresentationAsset, validatePresentationAssetDimensions } from '../../../shared/crypto/vault-v2-assets'
import { openMemberVaultKey } from '../../../shared/crypto/vault-v2-member-sync'
import { wipe } from '../../../shared/crypto/sodium'
import { parseJwtPayload } from '../../../shared/lib/jwt'
import { useAuthStore } from '../../auth'
import { getEncryptedVault } from '../sync/member-sync-api'
import { downloadEncryptedAsset } from './encrypted-asset-api'

export function useVaultEncryptedAssetUrl(vaultId: string, assetId: string | null): {
  url: string | null
  corrupt: boolean
} {
  const privateKey = useAuthStore((state) => state.privateKey)
  const memberId = useAuthStore((state) => state.userId)
  const accessToken = useAuthStore((state) => state.accessToken)
  const requestKey = assetId && memberId && accessToken && privateKey ? `${vaultId}:${assetId}:${memberId}` : null
  const [state, setState] = useState<{ requestKey: string; url: string | null; corrupt: boolean } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | null = null
    if (!requestKey || !assetId || !memberId || !accessToken || !privateKey) return () => controller.abort()
    let organizationId: unknown
    try {
      organizationId = parseJwtPayload(accessToken)['org_id']
    } catch {
      return () => controller.abort()
    }
    if (typeof organizationId !== 'string') return () => controller.abort()
    const memberPrivateKey = new Uint8Array(privateKey)
    void (async () => {
      let vaultKey: Uint8Array | undefined
      let plaintext: Uint8Array | undefined
      try {
        const vault = await getEncryptedVault(vaultId, controller.signal)
        const keyVersion = vault.currentKeyEpoch.vaultKeyVersion
        vaultKey = await openMemberVaultKey(vault.memberVaultKey, {
          organizationId,
          vaultId,
          memberId,
          vkVersion: keyVersion,
          memberKeyGeneration: vault.memberKeyGeneration,
        }, memberPrivateKey)
        const remote = await downloadEncryptedAsset(vaultId, assetId, controller.signal)
        if (remote.target !== 1 || remote.entryId !== undefined) throw new Error('Vault asset scope mismatch')
        const decrypted = await decryptPresentationAsset(remote.ciphertext, {
          organizationId,
          vaultId,
          assetId,
          target: 1,
          keyVersion,
          memberKeyGeneration: vault.memberKeyGeneration,
        }, vaultKey)
        plaintext = decrypted.bytes
        if (decrypted.mediaType !== remote.mediaType) throw new Error('Vault asset media type mismatch')
        const blob = new Blob([new Uint8Array(plaintext)], { type: decrypted.mediaType })
        await validatePresentationAssetDimensions(blob)
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setState({ requestKey, url: objectUrl, corrupt: false })
      } catch {
        if (!controller.signal.aborted) setState({ requestKey, url: null, corrupt: true })
      } finally {
        wipe(memberPrivateKey)
        if (vaultKey) wipe(vaultKey)
        if (plaintext) wipe(plaintext)
      }
    })()
    return () => {
      controller.abort()
      wipe(memberPrivateKey)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [accessToken, assetId, memberId, privateKey, requestKey, vaultId])

  return state?.requestKey === requestKey ? { url: state.url, corrupt: state.corrupt } : { url: null, corrupt: false }
}
