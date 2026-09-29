import { useVaultEncryptedAssetUrl } from '../assets/use-vault-encrypted-asset-url'
import { EntryIcon, type EntryIconProps } from './entry-icon'

const ENCRYPTED_ASSET_REFERENCE = /^vault-asset:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/

/** Resolve authenticated custom assets only while their visible row is mounted. */
export function VaultPresentationIcon({ vaultId, entryId, icon, ...props }: EntryIconProps & { vaultId: string; entryId?: string }) {
  const assetId = ENCRYPTED_ASSET_REFERENCE.exec(icon ?? '')?.[1] ?? null
  const asset = useVaultEncryptedAssetUrl(vaultId, assetId, entryId)
  return <EntryIcon {...props} icon={assetId ? asset.url : icon} />
}
