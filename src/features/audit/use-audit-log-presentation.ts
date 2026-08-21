import { useCallback, useMemo } from 'react'
import { shortenKey } from '../../shared/lib/shorten-key'
import type { AuditLogItem } from './api/audit-api'
import { useAuditAgentNames, type AuditAgentNames } from './use-audit-agent-names'
import {
  useOrgAuditResourceNames,
  type OrgAuditResourceNames,
} from './use-org-audit-resource-names'

export interface AuditLogPresentation
  extends AuditAgentNames, OrgAuditResourceNames {}

export interface AuditLogPresentationOptions {
  enabled?: boolean
  entryNameById?: Readonly<Record<string, string>>
  vaultNameById?: Readonly<Record<string, string>>
}

/**
 * One presentation model for every Audit Log surface. Callers pass the whole
 * object to `AuditLogList`, so adding another resolver here automatically
 * reaches the global, dashboard, Agent, Vault and Entry logs.
 */
export function useAuditLogPresentation(
  items: AuditLogItem[],
  options: AuditLogPresentationOptions = {},
): AuditLogPresentation {
  const principals = useAuditAgentNames(items, options.enabled ?? true)
  const resources = useOrgAuditResourceNames(items)

  const entryNameById = useMemo(
    () => ({ ...resources.entryNameById, ...options.entryNameById }),
    [resources.entryNameById, options.entryNameById],
  )
  const vaultNameById = useMemo(
    () => ({ ...resources.vaultNameById, ...options.vaultNameById }),
    [resources.vaultNameById, options.vaultNameById],
  )

  const resolveEntryName = useCallback(
    (entryId: string) => entryNameById[entryId] ?? shortenKey(entryId),
    [entryNameById],
  )
  const resolveVaultName = useCallback(
    (vaultId: string) => vaultNameById[vaultId] ?? shortenKey(vaultId),
    [vaultNameById],
  )

  return {
    ...principals,
    ...resources,
    entryNameById,
    vaultNameById,
    resolveEntryName,
    resolveVaultName,
  }
}
