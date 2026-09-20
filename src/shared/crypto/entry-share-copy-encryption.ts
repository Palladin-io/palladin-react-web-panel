import { ENVELOPE_PURPOSE } from './envelope'
import { assertEnvelopeScope, type VaultEnvelopeContract } from './vault-envelope'
import { openVaultProjection, openVaultDerivedEnvelope, type EncryptedVaultProjection } from './vault-protocol'
import { sealCanonicalEntry } from './entry-protocol'
import { wipe } from './sodium'
import type { MemberSecretV1 } from './vault-plaintext'

export interface EntryShareCopyVault extends EncryptedVaultProjection {
  currentKeyEpoch: { vaultKeyVersion: number; vdkVersion: number }
  discoveryKey: VaultEnvelopeContract<{ wrappingVaultKeyVersion: number }>
}
export interface EntryShareCopyAuthority {
  organizationId: string
  memberId: string
  vaultId: string
}

function assertVault(vault: EncryptedVaultProjection, authority: EntryShareCopyAuthority) {
  if (vault.id !== authority.vaultId || vault.organizationId !== authority.organizationId) {
    throw new Error('Shared copy target does not match the selected Vault')
  }
}

export async function readEntryShareCopyVaultName(vault: EncryptedVaultProjection,
  authority: EntryShareCopyAuthority, privateKey: Uint8Array, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted()
  assertVault(vault, authority)
  const opened = await openVaultProjection(vault, privateKey, authority.memberId)
  try { signal.throwIfAborted(); return opened.metadata.name }
  finally { wipe(opened.vaultKey) }
}

export async function sealEntryShareCopy(secret: MemberSecretV1, vault: EntryShareCopyVault,
  authority: EntryShareCopyAuthority & { entryId: string }, privateKey: Uint8Array, signal: AbortSignal) {
  signal.throwIfAborted()
  assertVault(vault, authority)
  const wrapper = vault.memberVaultKey.wrappedVaultKey.descriptor
  const discovery = vault.discoveryKey.descriptor
  if (wrapper.wrappedKeyVersion !== vault.currentKeyEpoch.vaultKeyVersion
    || vault.memberVaultMetadata.descriptor.keyVersion !== vault.currentKeyEpoch.vaultKeyVersion
    || discovery.keyVersion !== vault.currentKeyEpoch.vdkVersion
    || discovery.memberKeyGeneration !== vault.memberKeyGeneration
    || discovery.binding.wrappingVaultKeyVersion !== vault.currentKeyEpoch.vaultKeyVersion) {
    throw new Error('Shared copy target key coordinates do not match the Vault authority')
  }
  assertEnvelopeScope(discovery, { organizationId: authority.organizationId,
    vaultId: authority.vaultId, purpose: ENVELOPE_PURPOSE.vaultDiscoveryKeyByVk })
  const opened = await openVaultProjection(vault, privateKey, authority.memberId)
  let discoveryKey: Uint8Array | undefined
  try {
    signal.throwIfAborted()
    discoveryKey = await openVaultDerivedEnvelope(vault.discoveryKey, opened.vaultKey)
    signal.throwIfAborted()
    const material = await sealCanonicalEntry({ ...authority, revision: '1', memberKeyGeneration: vault.memberKeyGeneration,
      vaultKeyVersion: vault.currentKeyEpoch.vaultKeyVersion, vdkVersion: vault.currentKeyEpoch.vdkVersion },
    secret, opened.vaultKey, discoveryKey, 1)
    signal.throwIfAborted()
    return material
  } finally { wipe(opened.vaultKey); if (discoveryKey) wipe(discoveryKey) }
}
