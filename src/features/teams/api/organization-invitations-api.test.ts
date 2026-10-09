import { beforeEach, describe, expect, it, vi } from 'vitest'

const browserPost = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/api/browser-session-transport', () => ({ browserSessionPost: browserPost }))
const postJson = vi.hoisted(() => vi.fn())
const postFn = vi.hoisted(() => vi.fn(() => ({ json: postJson })))

vi.mock('../../../shared/api/client', () => ({
  api: {
    post: postFn,
    get: vi.fn(() => ({ json: postJson })),
  },
}))

import {
  acceptOrganizationInvitation,
  getOrganizationInvitations,
  resendOrganizationInvitation,
} from './organization-invitations-api'

describe('organization invitation contract', () => {
  beforeEach(() => {
    postFn.mockClear()
    postJson.mockReset()
  })

  it('parses pending invitation metadata without exposing its token', async () => {
    postJson.mockResolvedValue({ items: [{
      id: 'invitation-1',
      email: 'person@example.com',
      roleId: 'role-1',
      roleName: 'User',
      invitedByName: 'Alice Morgan',
      createdAt: '2026-08-20T10:00:00Z',
      sentAt: '2026-08-20T11:00:00Z',
      expiresAt: '2026-08-23T10:00:00Z',
      resendAvailableAt: '2026-08-20T11:01:00Z',
    }] })
    const [invitation] = await getOrganizationInvitations()

    expect(invitation).toEqual({
      id: 'invitation-1',
      email: 'person@example.com',
      roleId: 'role-1',
      roleName: 'User',
      invitedByName: 'Alice Morgan',
      createdAt: '2026-08-20T10:00:00Z',
      sentAt: '2026-08-20T11:00:00Z',
      expiresAt: '2026-08-23T10:00:00Z',
      resendAvailableAt: '2026-08-20T11:01:00Z',
    })
    expect(invitation).not.toHaveProperty('token')
  })

  it('keeps historical invitation metadata without revalidating it', async () => {
    const invitation = { id: 'legacy', email: 'legacy-email', roleId: null, roleName: null, invitedByName: null }
    postJson.mockResolvedValue({ items: [invitation] })
    expect(await getOrganizationInvitations()).toEqual([invitation])
  })

  it('parses resend timing without exposing the replacement token', async () => {
    postJson.mockResolvedValue({
      sentAt: '2026-08-20T11:00:00Z',
      expiresAt: '2026-08-23T11:00:00Z',
      resendAvailableAt: '2026-08-20T11:01:00Z',
    })
    const result = await resendOrganizationInvitation('invitation-1')

    expect(result.resendAvailableAt).toBe('2026-08-20T11:01:00Z')
    expect(result).not.toHaveProperty('token')
  })

  it('sends an empty JSON body when resending so ky sets the JSON content type', async () => {
    postJson.mockResolvedValue({
      sentAt: '2026-08-20T11:00:00Z',
      expiresAt: '2026-08-23T11:00:00Z',
      resendAvailableAt: '2026-08-20T11:01:00Z',
    })

    await resendOrganizationInvitation('invitation-1')

    expect(postFn).toHaveBeenCalledWith(
      'api/organization/invitations/invitation-1/resend',
      { json: {} },
    )
  })

  it('accepts an invitation with the opaque token and returns the joined session', async () => {
    const session = {
      accessToken: 'access-token',
      sessionId: 'refresh-token',
      userId: 'user-1',
      isOnboarded: true,
      emailVerified: true,
    }
    browserPost.mockResolvedValue(session)

    await expect(acceptOrganizationInvitation('opaque-invitation-token')).resolves.toEqual(session)
    expect(browserPost).toHaveBeenCalledWith(
      'organization/invitations/accept',
      expect.objectContaining({ json: { token: 'opaque-invitation-token' } }),
    )
  })
})
