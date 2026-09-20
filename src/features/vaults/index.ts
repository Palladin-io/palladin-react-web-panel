export { VaultListPage } from './vault-list-page'
export { VaultCard } from './components/vault-card'
export { VaultDetailPage } from './vault-detail-page'
export { ExportDialog } from './components/export-dialog'
// ImportWizardModal is intentionally NOT re-exported here: it is lazy-loaded in
// vault-detail-page so its parser deps (papaparse + fflate) stay out of the
// route bundle. A static barrel re-export would defeat that code-split.
export type { VaultDetailTab } from './components/vault-detail-tabs'
export { VaultSettingsPage } from './vault-settings-page'
export { EntryDetailPage } from './entry-detail-page'
export { EntryShareReceiverPage } from './sharing/entry-share-receiver-page'
export type {
  CreateVaultInput,
  EntryDetail,
  EntryListItem,
  EntryPlaintext,
  EntryType,
  GrantMode,
  UpdateVaultInput,
  Vault,
  VaultSummary,
} from './types'
export {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_KEY,
  GRANT_MODE_FULL,
  GRANT_MODE_GRANULAR,
  PERMISSION_FULL_GRANT_MODE,
  PERMISSION_MULTIPLE_VAULTS,
  normalizeEntryType,
} from './types'
export { useVaults } from './use-vaults'
export { useVault } from './use-vault'
export { useEntriesInfinite, useAllEntries, useEntryDetail } from './use-entries'
export { useCreateEntry } from './use-create-entry'
export { MemberSyncProvider } from './sync/member-sync-provider'
export { RotationProvider } from './rotation/rotation-provider'
export { useRotationStore } from './rotation/rotation-store'
export { searchMemberIndex, useMemberSyncStore } from './sync/member-sync-store'
export { reconcileAgentDiscovery } from './sync/agent-discovery-reconciler'
export type { MemberIndexRecord } from './sync/member-sync-store'
// Promoted for the dashboard "Recently added / modified" widget so a
// lightweight entry row can reuse the canonical icon/colour presentation
// instead of duplicating the mapping.
export {
  ENTRY_ICON_COLORS,
  isCustomIconUrl,
  presentationForType,
} from './components/entry-presentation'
export { EntryIcon } from './components/entry-icon'
export { hexWithAlpha } from './components/vault-color'
export {
  DEFAULT_VAULT_COLOR,
  DEFAULT_VAULT_ICON,
} from './components/vault-presentation'
export { useVaultEncryptedAssetUrl } from './assets/use-vault-encrypted-asset-url'
