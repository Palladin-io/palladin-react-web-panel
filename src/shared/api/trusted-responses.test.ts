import { beforeEach, describe, expect, it, vi } from 'vitest'
const json = vi.hoisted(() => vi.fn())
vi.mock('./client', () => ({ api: { get: vi.fn(() => ({ json })), post: vi.fn(() => ({ json })) } }))
import { getOrgGrants } from '../../features/grants/api/org-grants-api'
import { getNotifications } from '../../features/notifications/notifications-api'
import { getOrganization } from '../../features/settings/api/org-api'
import { getNotificationPreferences } from '../../features/notifications/preferences-api'
import { getOrganizationInvitations } from '../../features/teams/api/organization-invitations-api'
import { getVaultAuditLogs } from '../../features/audit/api/audit-api'

beforeEach(() => json.mockReset())
describe('trusted API display responses', () => {
  it('keeps a historical grant even when its reason material is unavailable', async () => {
    json.mockResolvedValue({ items: [{
      id: 'grant', vaultId: 'vault', type: 'granular', status: 'expired',
      createdAt: '2026-09-19T12:00:00Z', agentAccessEpoch: 0,
      encryptedReason: { descriptor: { futureFormat: true } },
    }] })
    const page = await getOrgGrants()
    expect(page.items).toHaveLength(1)
    expect(page.items[0].id).toBe('grant')
    expect(page.items[0].encryptedReason).toBeNull()
  })
  it('keeps a notification with a future category and action state', async () => {
    json.mockResolvedValue({ items: [{ id: 'n1', type: 'future', category: 'information',
      titleKey: 'future', occurredAt: '2026-09-19T12:00:00Z', actionState: 'expired', metadata: {} }] })
    const page = await getNotifications()
    expect(page.items).toHaveLength(1)
    expect(page.items[0].category).toBe('information')
    expect(page.items[0].actionState).toBe('expired')
  })
  it('does not invent positive seat limits for an organization response', async () => {
    const organization = { orgId: 'org', name: 'Example', memberCount: 0, seatUsage: 0, seatLimit: 0 }
    json.mockResolvedValue(organization)
    await expect(getOrganization()).resolves.toEqual(organization)
  })
  it('keeps preferences for future notification categories', async () => {
    const preference = { type: 'future', category: 'information', inboxEnabled: true,
      signalREnabled: false, pushEnabled: false, mandatory: false }
    json.mockResolvedValue({ items: [preference] })
    await expect(getNotificationPreferences()).resolves.toEqual([preference])
  })
  it('does not apply browser email validation to a retained invitation', async () => {
    const invitation = { id: 'invitation', email: 'legacy-address', roleId: 'role', roleName: 'User',
      invitedByName: null, createdAt: 'past', sentAt: 'past', expiresAt: 'past', resendAvailableAt: 'past' }
    json.mockResolvedValue({ items: [invitation] })
    await expect(getOrganizationInvitations()).resolves.toEqual([invitation])
  })
  it('preserves an unknown audit actor instead of silently identifying it as System', async () => {
    json.mockResolvedValue({ items: [{ id: 'audit', eventType: 'future.event', actorType: 'service',
      metadata: {}, createdAt: '2026-09-19T12:00:00Z' }] })
    const page = await getVaultAuditLogs('vault')
    expect(page.items[0].actorType).toBe('service')
  })
})
