import {
  GRANT_STATUS_ACTIVE,
  GRANT_TYPE_FULL,
  GRANT_TYPE_SCRIPT_EXECUTION,
  type OrgGrant,
} from './api/org-grants-api'
import { GRANT_METHOD_EXEC, parseGrantMethods } from './grant-methods'

/** Only ACTIVE grants count as existing coverage. */
function activeGrants(grants: OrgGrant[]): OrgGrant[] {
  return grants.filter((g) => g.status === GRANT_STATUS_ACTIVE)
}

/**
 * Agents that already have FULL (whole-vault) access — excluded from the
 * agent-for-vault picker. An agent with only a GRANULAR grant on a single entry
 * stays eligible: granting FULL upgrades it (the backend supersedes the now
 * redundant granular grant). Only an existing active FULL blocks re-adding.
 */
export function agentsCoveringVault(grants: OrgGrant[]): Set<string> {
  const covered = new Set<string>()
  for (const g of activeGrants(grants)) {
    if (g.agentId && g.type === GRANT_TYPE_FULL) covered.add(g.agentId)
  }
  return covered
}

/**
 * Agents that already cover a specific ENTRY — active FULL on its vault OR
 * active GRANULAR on that entry. Excluded from the agent-for-entry picker.
 */
export function agentsCoveringEntry(grants: OrgGrant[], entryId: string): Set<string> {
  const covered = new Set<string>()
  for (const g of activeGrants(grants)) {
    if (!g.agentId) continue
    if (g.type === GRANT_TYPE_FULL || g.entryId === entryId
      || (g.type === GRANT_TYPE_SCRIPT_EXECUTION
        && g.scriptScopes.some((scope) => scope.isScript && scope.entryId === entryId))) {
      covered.add(g.agentId)
    }
  }
  return covered
}

/** Script execution is covered only by direct ScriptExecution or FULL with Exec. */
export function agentsCoveringScriptExecution(grants: OrgGrant[], scriptEntryId: string): Set<string> {
  const covered = new Set<string>()
  for (const grant of activeGrants(grants)) {
    if (!grant.agentId) continue
    const fullExec = grant.type === GRANT_TYPE_FULL
      && parseGrantMethods(grant.methods).includes(GRANT_METHOD_EXEC)
    const direct = grant.type === GRANT_TYPE_SCRIPT_EXECUTION
      && grant.scriptScopes.some((scope) => scope.isScript && scope.entryId === scriptEntryId)
    if (fullExec || direct) covered.add(grant.agentId)
  }
  return covered
}

/**
 * Vaults where the given agent already has an active FULL grant — excluded from
 * the agent→vault (FULL) picker. A vault where the agent only has a GRANULAR
 * grant stays eligible: granting FULL upgrades it (the backend supersedes the
 * granular). Only an existing active FULL blocks re-adding.
 */
export function vaultsCoveredByAgent(grants: OrgGrant[]): Set<string> {
  const covered = new Set<string>()
  for (const g of activeGrants(grants)) {
    if (g.type === GRANT_TYPE_FULL) covered.add(g.vaultId)
  }
  return covered
}

/**
 * Coverage for the agent→entry picker: entries the agent already covers via an
 * active GRANULAR grant, plus vaults it covers via an active FULL grant (a FULL
 * grant covers every entry in that vault). Returns both sets so the entry
 * search can drop matches by `entryId` OR `vaultId`.
 */
export function entryCoverageByAgent(grants: OrgGrant[]): {
  coveredEntryIds: Set<string>
  fullCoveredVaultIds: Set<string>
} {
  const coveredEntryIds = new Set<string>()
  const fullCoveredVaultIds = new Set<string>()
  for (const g of activeGrants(grants)) {
    if (g.type === GRANT_TYPE_FULL) fullCoveredVaultIds.add(g.vaultId)
    else if (g.entryId) coveredEntryIds.add(g.entryId)
    else if (g.type === GRANT_TYPE_SCRIPT_EXECUTION) {
      const parent = g.scriptScopes.find((scope) => scope.isScript)
      if (parent) coveredEntryIds.add(parent.entryId)
    }
  }
  return { coveredEntryIds, fullCoveredVaultIds }
}
