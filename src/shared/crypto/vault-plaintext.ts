import { currentVaultPlaintext } from '@palladin/crypto'

export const {
  AGENT_FIELD_ACCESS, publicAssetIconReference, parsePublicAssetIconReference,
  encodeMemberVaultMetadata, encodeMemberIndex, encodeMemberSecret, encodeAgentDiscovery,
  encodeGrantPayload, encodeScriptReferencePayload, parseMemberVaultMetadata, parseMemberIndex,
  parseMemberSecret, parseAgentDiscovery, parseGrantPayload, projectMemberIndex,
  projectAgentDiscovery, projectGrantPayload, projectScriptReferencePayload,
  grantPayloadPolicyFieldId, listGrantableFieldIds, memberIndexSearchValues, presentationIconReference,
} = currentVaultPlaintext

export type AgentFieldAccess = currentVaultPlaintext.AgentFieldAccess
export type VaultEntryTypeName = currentVaultPlaintext.VaultEntryTypeName
export type MemberVaultMetadataV1 = currentVaultPlaintext.MemberVaultMetadataV1
export type MemberSecretV1 = currentVaultPlaintext.MemberSecretV1
export type MemberIndexV1 = currentVaultPlaintext.MemberIndexV1
export type AgentDiscoveryV1 = currentVaultPlaintext.AgentDiscoveryV1
export type GrantPayloadV1 = currentVaultPlaintext.GrantPayloadV1
export type PublicAssetVaultIconV1 = currentVaultPlaintext.PublicAssetVaultIconV1
