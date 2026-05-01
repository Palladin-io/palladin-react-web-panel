/**
 * Placeholder agent-grant data for the vault detail Agents tab.
 *
 * The real agent + grant API lands with CVT-46. For CVT-30 we ship a
 * fixed dataset that exercises every visual state (active/full,
 * active/granular, expired/full, revoked/granular) so the design pass
 * can be reviewed end-to-end. Once `useGrants(vaultId)` exists, this
 * file gets removed.
 */

export type GrantStatus = 'active' | 'expired' | 'revoked'
export type GrantMode = 'full' | 'granular'
export type AgentType = 'claude' | 'cursor' | 'copilot' | 'openclaw' | 'generic'

export interface GrantEntry {
  name: string
  status: GrantStatus
  expires?: string
  expiresAt?: string
}

export interface MockAgentGrant {
  id: string
  agent: { name: string; initials: string; type: AgentType }
  mode: GrantMode
  status: GrantStatus
  expires: string
  expiresAt?: string
  grantedBy?: string
  entries?: GrantEntry[]
  revokedBy?: string
  revokedAt?: string
  revokedRelative?: string
  revokedReason?: string
}

export const MOCK_AGENT_GRANTS: MockAgentGrant[] = [
  {
    id: 'grant-claude',
    agent: { type: 'claude', initials: 'CL', name: 'Claude' },
    mode: 'full',
    status: 'active',
    expires: 'in 6h',
    expiresAt: 'Apr 26 at 20:22',
    grantedBy: 'Patryk',
  },
  {
    id: 'grant-cursor',
    agent: { type: 'cursor', initials: 'Cu', name: 'Cursor' },
    mode: 'granular',
    status: 'active',
    expires: 'in 23h',
    expiresAt: 'Apr 27 at 13:05',
    grantedBy: 'Patryk',
    entries: [
      { name: 'AWS Access Key', status: 'active', expires: 'in 23h', expiresAt: 'Apr 27 at 13:05' },
      { name: 'Stripe API Key', status: 'active', expires: 'in 18h', expiresAt: 'Apr 27 at 07:30' },
      { name: 'GitHub Token', status: 'expired', expires: '2h ago', expiresAt: 'Apr 26 at 11:05' },
      { name: 'OpenAI API Key', status: 'active', expires: 'in 20h', expiresAt: 'Apr 27 at 09:22' },
    ],
  },
  {
    id: 'grant-copilot',
    agent: { type: 'copilot', initials: 'Co', name: 'Copilot' },
    mode: 'full',
    status: 'expired',
    expires: '2h ago',
    expiresAt: 'Apr 26 at 12:10',
    grantedBy: 'Patryk',
  },
  {
    id: 'grant-openclaw',
    agent: { type: 'openclaw', initials: 'OC', name: 'OpenClaw' },
    mode: 'granular',
    status: 'revoked',
    expires: '',
    grantedBy: 'Patryk',
    revokedBy: 'Patryk',
    revokedAt: 'Apr 25 at 09:15',
    revokedRelative: '1d ago',
    revokedReason: 'Suspected credential compromise',
    entries: [
      { name: 'AWS Access Key', status: 'revoked' },
      { name: 'Stripe API Key', status: 'revoked' },
    ],
  },
]
