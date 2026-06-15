import { describe, expect, it } from 'vitest'
import type { NotificationItem } from './notifications-api'
import { notificationGrantContext } from './notification-grant-context'

function makeItem(metadata: Record<string, string>): NotificationItem {
  return {
    id: 'n',
    type: 'grant_pending',
    category: 'ActionRequired',
    titleKey: 'k',
    metadata,
    occurredAt: '2026-06-15T10:00:00Z',
    readAt: null,
    actionState: 'pending',
  }
}

describe('notificationGrantContext', () => {
  it('extracts grant ids + display names from metadata', () => {
    const ctx = notificationGrantContext(
      makeItem({
        grantId: 'g1',
        vaultId: 'v1',
        entryId: 'e1',
        agentId: 'a1',
        agentName: 'Deploy Bot',
        entryLabel: 'GitHub Token',
        vaultName: 'Production',
        agentPublicKey: 'pk',
        methods: 'get',
      }),
    )

    expect(ctx).toMatchObject({
      grantId: 'g1',
      vaultId: 'v1',
      entryId: 'e1',
      agentId: 'a1',
      agentPublicKey: 'pk',
    })
  })

  it('returns null when grantId or vaultId is missing (no malformed action)', () => {
    expect(notificationGrantContext(makeItem({ grantId: 'g1' }))).toBeNull()
    expect(notificationGrantContext(makeItem({ vaultId: 'v1' }))).toBeNull()
    expect(notificationGrantContext(makeItem({}))).toBeNull()
  })

  it('nulls absent optional fields rather than leaving them undefined', () => {
    const ctx = notificationGrantContext(makeItem({ grantId: 'g1', vaultId: 'v1' }))
    expect(ctx?.agentPublicKey).toBeNull()
    expect(ctx?.entryId).toBeNull()
    expect(ctx?.agentId).toBeNull()
  })
})
