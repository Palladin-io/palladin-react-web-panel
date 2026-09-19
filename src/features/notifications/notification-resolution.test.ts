import { describe, expect, it } from 'vitest'
import type { Agent } from '../agents'
import type { DecryptedMemberVault } from '../vaults/sync/member-sync-store'
import type { NotificationItem } from './notifications-api'
import { notificationCardPresentation } from './notification-presentation'
import { notificationDeepLink, resolveNotificationItem } from './notification-resolution'

const vaultId = '11112233-4455-4677-8899-aabbccddeeff'
const entryId = '22222233-4455-4677-8899-aabbccddeeff'
const agentId = '33332233-4455-4677-8899-aabbccddeeff'

const item: NotificationItem = {
  id: 'notification', type: 'grant_pending', category: 'actionRequired', titleKey: 'ignored',
  metadata: { vaultId, entryId, agentId, grantId: 'grant' },
  occurredAt: '2026-07-26T12:00:00Z', readAt: null, actionState: 'pending',
}

describe('notification local resolution', () => {
  it('adds presentation only from unlocked MemberIndex and the authorized Agent cache', () => {
    const vault = {
      vaultId,
      metadata: { name: 'Production' },
      entries: new Map([[entryId, {
        entryId, corrupt: false, payload: { memberLabel: 'GitHub', entryType: 0, searchFields: [] },
      }]]),
    } as unknown as DecryptedMemberVault
    const agent = {
      agentId, name: 'Deploy Bot', type: 'codex', lastHostname: 'runner.local', lastIp: '127.0.0.1',
      iconKey: 'robot',
    } as Agent

    expect(resolveNotificationItem(item, {
      vaults: new Map([[vaultId, vault]]), agents: new Map([[agentId, agent]]),
    }).metadata).toEqual(expect.objectContaining({
      vaultName: 'Production', entryLabel: 'GitHub', agentName: 'Deploy Bot',
      agentType: 'codex', host: 'runner.local', ip: '127.0.0.1',
    }))
  })

  it('keeps missing/deleted references opaque and derives only internal routes', () => {
    const unresolved = resolveNotificationItem(item, { vaults: new Map(), agents: new Map() })
    expect(unresolved.metadata).not.toHaveProperty('vaultName')
    expect(notificationDeepLink(unresolved)).toEqual({
      to: '/vaults/$vaultId/grants/$grantId', params: { vaultId, grantId: 'grant' },
    })
    expect(notificationDeepLink({ ...item, type: 'future', metadata: {} })).toBeNull()
  })

  it('resolves the approver of an approved agent from the authorized Agent cache', () => {
    const agent = {
      agentId,
      name: 'Deploy Bot',
      enrolledByName: 'Patryk R.',
    } as Agent
    const approved = {
      ...item,
      type: 'agent_approved',
      category: 'update' as const,
      metadata: { agentId },
      actionState: null,
    }

    expect(resolveNotificationItem(approved, {
      vaults: new Map(),
      agents: new Map([[agentId, agent]]),
    }).metadata.actorName).toBe('Patryk R.')
  })

  it('restores the pending Agent key hint and connection details for the Inbox', () => {
    const pending = {
      ...item,
      type: 'agent_pending',
      metadata: { agentId, agentType: 'Unknown' },
    }
    const agent = {
      agentId,
      publicKeyPrefix: 'ABCDEFGH',
      publicKeySuffix: '12345678',
      lastHostname: 'Patryks-Mac-Studio.local',
      lastIp: '127.0.0.1',
    } as Agent

    const resolved = resolveNotificationItem(pending, {
      vaults: new Map(),
      agents: new Map([[agentId, agent]]),
    })

    expect(resolved.metadata).toEqual(expect.objectContaining({
      agentPublicKeyHint: 'ABCDEFGH…12345678',
      host: 'Patryks-Mac-Studio.local',
      ip: '127.0.0.1',
      agentType: 'Unknown',
    }))
    const rows = notificationCardPresentation(resolved).rows
    expect(rows[0].value).toEqual({ kind: 'text', text: 'ABCDEFGH…12345678' })
    expect(rows[2].value).toEqual({ kind: 'text', text: 'Unknown' })
    expect(rows[3].value).toEqual({
      kind: 'text',
      text: 'Patryks-Mac-…io.local · 127.0.0.1',
    })
  })
})

describe('grant notification destinations', () => {
  it.each(['grant_approved', 'grant_denied', 'grant_revoked'])('opens the original %s grant', (type) => {
    expect(notificationDeepLink({ ...item, type })).toEqual({
      to: '/vaults/$vaultId/grants/$grantId', params: { vaultId, grantId: 'grant' },
    })
  })
  it('falls back to the Vault when an older notification has no grant ID', () => {
    expect(notificationDeepLink({ ...item, metadata: { vaultId } })).toEqual({
      to: '/vaults/$vaultId', params: { vaultId }, search: { tab: 'agents' },
    })
  })
})
