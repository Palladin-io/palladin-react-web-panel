import type { AssignablePermission } from '../../shared/api/organization-roles-api'

export type PermissionGroup = 'organization' | 'vaults' | 'agents' | 'oversight' | 'other'

interface PermissionPresentation {
  group: PermissionGroup
  labelKey: string
  descriptionKey: string
}

const PRESENTATION: Record<string, PermissionPresentation> = {
  adduser: { group: 'organization', labelKey: 'permissions.flags.addUser', descriptionKey: 'permissions.flags.addUserDescription' },
  organizationmanagement: { group: 'organization', labelKey: 'permissions.flags.organizationManagement', descriptionKey: 'permissions.flags.organizationManagementDescription' },
  billingmanage: { group: 'organization', labelKey: 'permissions.flags.billingManage', descriptionKey: 'permissions.flags.billingManageDescription' },
  vaultcreate: { group: 'vaults', labelKey: 'permissions.flags.vaultCreate', descriptionKey: 'permissions.flags.vaultCreateDescription' },
  vaultmanage: { group: 'vaults', labelKey: 'permissions.flags.vaultManage', descriptionKey: 'permissions.flags.vaultManageDescription' },
  grantmanage: { group: 'vaults', labelKey: 'permissions.flags.grantManage', descriptionKey: 'permissions.flags.grantManageDescription' },
  agentmanage: { group: 'agents', labelKey: 'permissions.flags.agentManage', descriptionKey: 'permissions.flags.agentManageDescription' },
  readapikey: { group: 'agents', labelKey: 'permissions.flags.readApiKey', descriptionKey: 'permissions.flags.readApiKeyDescription' },
  writeapikey: { group: 'agents', labelKey: 'permissions.flags.writeApiKey', descriptionKey: 'permissions.flags.writeApiKeyDescription' },
  auditview: { group: 'oversight', labelKey: 'permissions.flags.auditView', descriptionKey: 'permissions.flags.auditViewDescription' },
}

export interface PresentedPermission extends AssignablePermission, PermissionPresentation {}

export function presentPermission(permission: AssignablePermission): PresentedPermission {
  return {
    ...permission,
    ...(PRESENTATION[permission.key.toLowerCase()] ?? {
      group: 'other' as const,
      labelKey: 'permissions.flags.unknown',
      descriptionKey: 'permissions.flags.unknownDescription',
    }),
  }
}
